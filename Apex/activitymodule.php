<?php
namespace Modules;

use Format\FormatLink;
use Format\FormatChainedLink;
use Format\FormatTruncate;
use Format\FormatYesNo;
use Query;


class ActivityModule extends Module {

	function __construct(array $options = []){

		$this->id_prefix = "ACT";
		$this->id_url = WEB_PATH . "activities/detail?activity_id={ID}";
		parent::__construct($options);

	}

	protected function initializeQuery(){

		$this->query = new Query();
		$this->query
			->from("activities", "a")
			->join("activity_types", "at", "ON at.id = a.activity_type_id")
			->leftjoin("activity_statuses", "ast", "ON ast.id = a.activity_status_id")
		;
	}

	/**
	 * Handle leftovers from the configuration run
	 * @param array $leftovers
	 */
	protected function configureLeftovers(array $leftovers){

		//Handle search term items
		if(empty($leftovers['filters'])) return;

		$search = $leftovers['filters'];

		// Iterate through contact search fields
		if(!empty($search['contact'])):
			foreach($search['contact'] as $k => $v):
				$v = trim($v);
				if(!strlen($v)) continue;
				switch($k){
					case 'name':
						$this->query
							->andWhere("a.name ILIKE '%'||?||'%'")
							->addParam($v)
						;
						break;
					case 'description':
						$this->query
							->andWhere("a.description ILIKE '%'||?||'%'")
							->addParam($v)
						;
						break;
					case 'activity_type_id':
						$this->query
							->andWhere("a.activity_type_id) = ?")
							->addParam(intval($v))
						;
					case 'activity_status_id':
						break;
					case 'created_timestamp':
						break;
					case 'created_by':
						break;
				}
			endforeach;
		endif;

		// Non-activity related searches
		foreach($search as $k => $v):
			if(!is_array($v)):
				$v = trim($v);
			endif;
			if(!$v) continue;
			switch($k){
			/*case 'related_to':
				$this->query
					->where(" EXISTS (
								SELECT t.asset_id
								FROM transactions t
								WHERE t.asset_id = ? )
							")
					->addParam(intval($v))
				;

				break;*/
			case 'landlord':
				$this->query
					->where("a.name ILIKE '%'||?||'%'")
					->addParam($v)
					->orWhere("a.description ILIKE '%'||?||'%'")
					->addParam($v)
				;
				break;
			case 'tenant':
				$this->query
					->andWhere("a.name ILIKE '%'||?||'%'")
					->addParam($v)
					->andWhere("a.description ILIKE '%'||?||'%'")
					->addParam($v)
				;
				break;

			// Activity Filters
			case 'name':
				$this->query
				->where("a.name ILIKE '%'||?||'%'")
				->addParam($v)
				;
				break;
			case 'description':
				break;
			case 'activity_type_id':
				$this->query
				->andWhere("a.activity_type_id = ?")
				->addParam(intval($v))
				;
				break;
			case 'activity_status_id':
				$this->query
				->andWhere("a.activity_status_id = ?")
				->addParam($v)
				;
				break;
			}
		endforeach;

		// The big filter
		/*if(!empty($search['term'])):
<<<<<<< HEAD
			$this->query // This needs to thought out more
				->where(" EXISTS
=======
			$this->query
				->andWhere("
>>>>>>> refs/remotes/origin/crm-integration
					(
						a.name ILIKE '%'||?'%'
						OR a.description ILIKE '%'||?'%'
						OR a.activity_type_id  = ?
						OR a.activity_status_id = ?
					)
				")
				->addParams(array_fill(0,9, $search['term']))
			;
		endif;*/

	}


	/**
	 * Handle leftovers from the configuration run
	 * @param array $leftovers
	 */
	function asSearchResult(){

		$trunc10 = new FormatTruncate(10);
		$trunc20 = new FormatTruncate(20);
		$trunc35 = new FormatTruncate(35);
		$trunc100 = new FormatTruncate(100);

		$this->query
			->clearSelect()
			->select("DISTINCT ON (a.id) a.id", "activity_id", ["is_visible" => true])
			->select("a.name", "Subject", [
					"add_classes" => "left",
					"formatter" => new FormatChainedLink($trunc35, "/activities/detail?activity_id={ACTIVITY_ID}")
					])
			->select("a.description", null, ["formatter" => $trunc100])
			->select("a.activity_type_id")
			->select("activity_status_id", "Status")
			->select("a.created_timestamp")
			->paginate(10)
			->makeSortable()
			->orderBy("a.created_timestamp", "desc")
		;

		$query = $this->query;
		$dataset = $this->query->returnDataSet();

		//var_dump($query."");
		return $this->query->returnDataSet();

	}


}
