<?php
namespace WellsFargo;

use HTML\Form\Container\DataSet;
use HTML\Form\Field\Date;
use HTML\Form\Field\Money;
use HTML\Form\Field\Span;
use HTML\Form\Container\Table;
use DateTime;
use DateTimeZone;
use SplPriorityQueue;
use Exception;

/**
 * Parses lockbox data files that conform to the BAI v2 specification
 */
class LockboxParser {

	protected $lockbox_file;

	protected $data = [];

	function __construct($file){

		$this->lockbox_file = $file;

		$data = [];

		//Open the lockbox file
		$handle = fopen($this->lockbox_file, "r");

		//Read the file
		while($line = fgets($handle)):

			$record = [];
			$record['type'] = substr($line, 0, 1);

			//Check the record type
			switch($record['type']):
				case 1: //immediate address header
					$record['destination'] = trim(substr($line, 3, 10));
					$record['origin'] = trim(substr($line, 13, 10));
					$record['timestamp'] = DateTime::createFromFormat("ymdHi", trim(substr($line, 23, 10)), new DateTimeZone("America/Chicago"));
					break;
				case 2: //service
				case 3: //unused
					continue 2;
					break;
				case 4: //overflow
					$record['sequence_num'] = intval(substr($line, 8, 2));
					$record['is_last?'] = substr($line, 10, 1) == 9;
					//$record['invoice'] = trim(substr($line, 11, 15)) ?: null;
					$record['invoice'] = trim(substr($line, 212, 30)) ?: null;
					$record['invoice_amt'] = substr($line, 26, 10) / 100;
					$record['invoice_date'] = intval(substr($line, 80, 6)) ? DateTime::createFromFormat("ymd", substr($line, 80, 6)) : null;
					$record['gross_invoice_amt'] = substr($line, 86, 11) / 100;
					$record['discount_invoice_amt'] = substr($line, 97, 11) / 100;
					$record['customer_number'] = trim(substr($line, 108, 30)) ?: null;
					$record['description'] = trim(substr($line, 152, 60)) ?: null;
					break;
				case 5: //lockbox header
					$record['lockbox'] = intval(substr($line, 7, 7));
					$record['date'] = DateTime::createFromFormat("ymd", substr($line, 14, 6));
					break;
				case 6: //detail
					$record['batch'] = intval(substr($line, 1, 3));
					$record['item'] = intval(substr($line, 4, 3));
					$record['amount'] = substr($line, 7, 10) / 100;
					$record['routing_num'] = trim(substr($line, 17, 9)) ?: null;
					$record['account_num'] = trim(substr($line, 26, 10)) ?: null;
					$record['check_num'] = trim(substr($line, 36, 10));
					$record['payee'] = trim(substr($line, 171, 60)) ?: null;
					$record['vicor_tid'] = trim(substr($line, 80, 7)) ?: null;
					$record['check_date'] = DateTime::createFromFormat("ymd", substr($line, 87, 6));
					$record['check_from'] = trim(substr($line, 93, 30)) ?: null;
					$record['customer_id'] = trim(substr($line, 123, 30)) ?: null;
					$record['check_postmarked'] = DateTime::createFromFormat("ymd", substr($line, 153, 6));
					$record['zipcode'] = trim(substr($line, 159, 9)) ?: null;
					$record['envelope_num'] = intval(substr($line, 168, 3)) ?: null;
					break;
				case 7: //batch total
					break;
				case 8: //service total
					break;
				case 9: //destination trailer
					break;
			endswitch;

			//$record['line'] = $line;

			$data[] = $record;

		endwhile;

		//Close the file
		fclose($handle);

		$this->data = $data;

	}

	/**
	 * Returns a parsed version of the lockbox data array
	 */
	function getData(){

		$struct = [];
		$lockbox = null;
		$check = null;

		foreach($this->data as $line):

			switch($line['type']):
				case 5:
					$lockbox = $line['lockbox'];
					$struct[$lockbox] = $line;
					break;
				case 6:
					$struct[$lockbox]['payments'][] = $line;
					break;
				case 4:
					$struct[$lockbox]['payments'][count($struct[$lockbox]['payments']) - 1]['line_items'][] = $line;
					break;
			endswitch;

		endforeach;

		return $struct;

	}

	/**
	 * Returns the raw contents of the lockbox source file
	 * @return string
	 */
	function returnRawSourceFile(){

		return file_get_contents($this->lockbox_file);

	}

	function __toString(){

		$table = new DataSet();
		$table->addChildren([
			new Span(["name" => "type"]),
			new Span(["name" => "lockbox"]),
			new Span(["name" => "batch"]),
			new Span(["name" => "item"]),
			new Span(["name" => "check_num"]),
			new Span(["name" => "check_from"]),
			new Money(["name" => "amount"]),
			new Money(["name" => "invoice_amt"]),
			new Span(["name" => "invoice"]),
			new Span(["name" => "description"]),
			new Date(["name" => "invoice_date"]),
			new Date(["name" => "check_date"]),
			new Span(["name" => "payee"])
		]);

		$table->enableExporting("lockbox.csv");
		$table->setValue($this->data);

		return (string) $table;

	}

	/**
	 * Parses the contents of invoice / description fields and pulls out
	 * relevant data in one pass
	 * @param array $contents Field values to be parsed
	 * @param string $default_date Default date to be used in m/d/Y format
	 */
	static function parseFields(array $contents, $default_date = null, $payor = null){

		$date_format = "m/d/Y";

		//Subkeys are tuples in the form of (value, accuracy)
		$data = [
			'asset_id' => new SplPriorityQueue(),
			'date1' => new SplPriorityQueue(), //If date1 is specified without date2, assumed to be a point in time
			'date2' => new SplPriorityQueue(),
			'location_company_code' => new SplPriorityQueue()
		];

		//Set the default date
		if($default_date && DateTime::createFromFormat("m/d/Y", $default_date)):
			$data['date1']->insert($default_date, 0);
		endif;

		$concat = $contents[0] . " " . $contents[1];

		//AT&T payments have the location code in the invoice field and a "M R(T|S)" at the start of description
		preg_match("/(?:INV\s+)?([0-9]+) [MO0] [BRU][RTS][0-9]?(?=\s+([0-9]{4})?-?)?/", $concat, $matches);
		if(!empty($matches[1])):
			$data['location_company_code']->insert(trim($matches[1]), 1.0);
			if(!empty($matches[2])):
				$data['date1']->insert(DateTime::createFromFormat("dmy", "01".$matches[2])->format($date_format), 1.0);
			endif;
			$contents = [null, null];
		endif;

		//Some payments may only have the location code
		preg_match("/^([0-9]+)$/", trim($contents[0]), $matches);
		if(!empty($matches[1]) && empty($contents[1])):
			$data['location_company_code']->insert(trim($contents[0]), 1.0);
			$contents = [null, null];
		endif;

		//American Tower payments have the location code in the description and a PN in the invoice
		$is_american_tower = false;

		foreach($contents as $subject):

			//Special handling of American Tower checks (search for payment number in first field)
			if(preg_match("/^PN-[0-9]+$/", $subject)):
				$is_american_tower = true;
				continue;
			endif;

			//Special handling for SIRIUS checks
			if(preg_match('/^SIRIUS/i', $payor)):
				preg_match("/\b([a-z]+[0-9]+[a-z])([0-9]{6})/i", $subject, $matches);
				if(!empty($matches[1])):
					$data['location_company_code']->insert($matches[1], 1.0);
					$date1 = DateTime::createFromFormat("mdy", $matches[2]);
					if($date1):
						$data['date1']->insert($date1->format($date_format), 1.0);
					endif;
				endif;
			endif;

			//Special handling for SBA Monarch Towers checks
			if(preg_match('/^SBA MONARCH/i', $payor)):
				preg_match("/RENT\s?([0-9]{5})/i", $subject, $matches);
				if(!empty($matches[0])):
					$data['location_company_code']->insert($matches[1], 0.4);
					//Remove the string due to a confident match
					$subject = str_replace($matches[0], "", $subject);
				endif;
			endif;

			//Grab location code field from American Tower checks
			if($is_american_tower):
				preg_match("/^([0-9]+),/", $subject, $matches);
				if(!empty($matches[1])):

					//Grab the trimmed location code
					$data['location_company_code']->insert(ltrim($matches[1], "0"), 1.0);

					//Remove the string due to a confident match
					$subject = str_replace($matches[0], "", $subject);

				endif;
			endif;

			//Search for WCP #
			preg_match_all("/\bWCP\s?#?\s?([0-9]{4,7})\b/i", $subject, $matches);
			foreach($matches[0] as $i => $v):

				//Mark the asset id as a fully accurate match
				$data['asset_id']->insert($matches[1][$i], $payor == 'I WIRELESS' ? 0.3 : 1.0);

				//Remove the string due to a confident match
				$subject = str_replace($matches[0][$i], "", $subject);

			endforeach;

			//Search for obvious date ranges
			preg_match_all("/\b([0-9]{6})-([0-9]{6})\b/", $subject, $matches);
			foreach($matches[0] as $i => $v):

				//Test the dates
				$date1 = DateTime::createFromFormat("mdy", $matches[1][$i]);
				$date2 = DateTime::createFromFormat("mdy", $matches[2][$i]);

				if($date1 && $date2):

					$data['date1']->insert($date1->format($date_format), 1.0);
					$data['date2']->insert($date2->format($date_format), 1.0);

					//Remove the string due to a confident match
					$subject = str_replace($matches[0][$i], "", $subject);

				endif;

			endforeach;

			//Search for full date ranges
			preg_match_all("#\b([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\s?-\s?([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\b#", $subject, $matches);
			foreach($matches[0] as $i => $v):

				//Test the dates
				try {

					$date1 = new DateTime($matches[1][$i]);
					$date2 = new DateTime($matches[2][$i]);

					$data['date1']->insert($date1->format($date_format), 1.0);
					$data['date2']->insert($date2->format($date_format), 1.0);

					//Remove the string due to a confident match
					$subject = str_replace($matches[0][$i], "", $subject);

				}catch(Exception $e){
				}

			endforeach;

			//Search for RNT-styled location code (Sprint)
			preg_match_all("/\b([a-z0-9]+)(RNT|CP|CPI)[0-9]+\b/i", $subject, $matches);
			foreach($matches[0] as $i => $v):

				$data['location_company_code']->insert($matches[1][$i], 1.0);

				//Remove the string due to a confident match
				$subject = str_replace($matches[0][$i], "", $subject);

			endforeach;

			//Search for LEAS-styled location code (Verizon)
			preg_match_all("/\b([a-z0-9]+)[a-z][0-9]{2}LEAS([0-9]{8})\b/i", $subject, $matches);
			foreach($matches[0] as $i => $v):

				//Grab the location code
				$data['location_company_code']->insert($matches[1][$i], 1.0);

				//Parse the date
				$date1 = DateTime::createFromFormat("Ymd", $matches[2][$i]);
				if($date1) $data['date1']->insert($date1->format($date_format), 1.0);

				//Remove the string due to a confident match
				$subject = str_replace($matches[0][$i], "", $subject);

			endforeach;

			//Search for month dates
			preg_match_all("/\b([a-z]{3}-([0-9]{2}|[0-9]{4}))\b/i", $subject, $matches);
			foreach($matches[0] as $i => $v):

				//Test the date
				try {

					$date1 = new DateTime($matches[1][$i]);
					$data['date1']->insert($date1->modify("first day of this month")->format($date_format), 0.8);
					$data['date2']->insert($date1->modify("last day of this month")->format($date_format), 0.8);

					//Remove the string due to a confident match
					$subject = str_replace($matches[0][$i], "", $subject);

				}catch(Exception $e){
				}

			endforeach;

			//Search for single dates
			preg_match_all("/\b([0-9]{4}-[0-9]{2}-[0-9]{2})\b/", $subject, $matches);
			foreach($matches[0] as $i => $v):

				//Test the date
				try {

					$date1 = new DateTime($matches[1][$i]);
					$data['date1']->insert($date1->format($date_format), 0.5);

					//Remove the string due to a confident match
					$subject = str_replace($matches[0][$i], "", $subject);

				}catch(Exception $e){
				}

			endforeach;

			//Search for Cricket location codes
			if(preg_match('/^cricket/i', $payor)):
				preg_match("/\b([a-z]{3}-?[0-9]+)[a-z]?\b/i", $subject, $matches);
				if(!empty($matches[0])):

					$data['location_company_code']->insert($matches[1], 1.0);

					//Remove the string due to a confident match
					$subject = str_replace($matches[0], "", $subject);

				endif;
			endif;

			//Search for explicitly named location codes
			preg_match_all("/\bsite\s+([a-z0-9]+)\b/i", $subject, $matches);
			foreach($matches[0] as $i => $v):

				$data['location_company_code']->insert($matches[1][$i], 0.9);

				//Remove the string due to a confident match
				$subject = str_replace($matches[0][$i], "", $subject);

			endforeach;

			//Search for other location codes
			preg_match_all("/\b\(?([a-z0-9-]+)\)?\b/i", $subject, $matches);
			foreach($matches[0] as $i => $v):

				//Exclude T-mobile invoice numbers
				if(preg_match("/^W[0-9]+$/", $matches[1][$i])) continue;

				//Ensure the location code has letters and digits
				if(preg_match("/[0-9]/", $matches[1][$i]) && preg_match("/[a-z]/i", $matches[1][$i])):

					$weight = preg_match("/-/", $matches[1][$i]) ? 0.6 : 0.4;
					$weight += strpos($subject, "(" . $matches[1][$i] . ")") !== false ? 0.15 : 0;
					$weight += strlen($matches[1][$i]) > 5 ? 0.1 : 0;
					$data['location_company_code']->insert($matches[1][$i], $weight);

					//Remove the string due to a confident? match
					$subject = str_replace($matches[0][$i], "", $subject);

				endif;

			endforeach;

			//Search for standalone WCP #s
			preg_match_all("/\b([0-9]{4,7})\b/", $subject, $matches);
			foreach($matches[0] as $i => $v):

				$data['asset_id']->insert($matches[1][$i], 0.2);

			endforeach;

			//Search for standalone dates in "my" format
			preg_match_all("/\b([0-9]{4})\b/", $subject, $matches);
			foreach($matches[0] as $i => $v):

				//Test the date
				try {
					$parts = str_split($matches[1][$i], 2);
					$date1 = new DateTime($parts[0]."/01/".$parts[1]);
					if($date1):
						$data['date1']->insert($date1->modify("first day of this month")->format($date_format), 0.1);
					endif;

				}catch(Exception $e){
				}

			endforeach;

		endforeach;

		return $data;

	}

}