<?php
use Format\FormatNumber;

use HTML\Form\Field\Date;
use HTML\Form\Container\Fieldset;
use HTML\Form\Field\Checkbox;
use HTML\Form\Field\FormField;
use HTML\Form\Field\Button;
use HTML\Form\Container\HGroup;
use HTML\Form\Field\Submit;
use HTML\Form\Container\Table;
use HTML\Form\Container\Grid;
use HTML\Form\Container\Form;
use Format\FormatLink;
use Format\FormatDate;
use Format\FormatTruncate;
use Format\FormatMoney;

//----------------------------------------------------------
// Asset Amortization Report - Accounting - for Harriet Wong
//----------------------------------------------------------

// This is an amortization report for active assets defining yearly depreciation

// Datapoints:
// Asset #
// Asset Name
// Investor

// Purchase Date
// Amortization Start Date (usually 1st of month after Purchase Date) *****

// Months Holdback - affects Amort Start Date - date of 1st real revenue {connected to per diem?}  *****

// Purchase Price
// Closing Costs/Deal Expenses - table: transaction_has_expenses
// New Cost Basis (Price - Closing Costs/Deal Expenses)

// Amortization per Month (Purchase Price / Purchase Term(in months))
// Months Remaining in Calendar year from Amort Start Date
// Yearly Depreciation - New Cost Basis - (Amort per Month * Months Remaining)
//

// Monthly Amortization Calculations
// Summary values will be calculated on monthly basis and need to be viewed by year and quarter

//-----------------------------------------------------
// Build the search form
//-----------------------------------------------------
$form = new Form;
$form
->addChild((new Grid (['cols' => 3]))
		->addChild((new Table())
			->addChild(with(FormField::build(["transactions.asset_id", "field_class" => "Text"]))
					->addClass("focus")
			)
			->addChild(FormField::build(["assets.name"]))
		)

		->addChild((new Table())
				//->addChildren(Helpers::makeDateRangeSearchFields("due_date", "Due Date"))
				->addChild(new Date(["anchor_date", "Anchor Date"]))
		)

		->addChild((new Table())
				->addChild(with(FormField::build(["asset_has_investors.investor_id"]))
						->setAttribute('size', 5)
						->setAttribute('multiple', 'multiple')
						->setDefaultText(false)
						->setName('investor_id[]')
				)
		)
)

		->addChild(
				with(new HGroup())
				->addChild(new Submit())
				->addChild(with(new Button)->setValue("Clear Form")->setAttribute("data-url", SCRIPT))
		)
		->preserveSorting()
		->setRequired(false, true)
;

//Populate the form
$form->setValue($_GET);

//-----------------------------------------------------
// Build the search query
//-----------------------------------------------------
$trunc = new FormatTruncate(20);
$query = new Query();
$query
	->select("a.id", "Asset #")
	->select("a.name", "Asset Name", ["formatter" => $trunc])
	->select("ahi.investor_id", "Investor", ["formatter" => $trunc])
	->select("a.lease_commencement_date", "Purchase Date")
	->select("a.rent_commencement_date", "Rent Starts") // Need to see where this val is set; also holdbacks
	->select("p.purchase_price", "Purchase Price") // Need to confirm source of final purchase price
	->select("p.closing_deal_expenses", "Closing Costs")  // Need to confirm total closing costs
	->select("p.purchase_price - p.closing_deal_expenses", "New Cost Basis", ["field_class" => "Money"])
	->select("to_months(p.purchase_term)", "Purchase Term", ["formatter" => new FormatNumber()])
	->select("(p.purchase_price / to_months(p.purchase_term))::numeric(12,2)", "Amort per Month", ["field_class" => "Money"])
	//->select("CURRENT_DATE - a.rent_commencement_date", "Total Amort")

	//->select("to_char(to_timestamp(to_char(extract(month from CURRENT_DATE), '999'), 'MM'), 'Mon')", "month")
	//->select("", "")
	->from("transactions", "t")
	->join("proposals", "p", "ON p.transaction_id = t.id AND p.is_closing_proposal")
	->join("assets", "a", "ON a.id = t.asset_id")
	->leftJoin("asset_has_investors", "ahi", "ON ahi.asset_id = t.asset_id AND CURRENT_DATE BETWEEN ahi.assignment_start_date AND COALESCE(ahi.assignment_end_date, 'Infinity')")// fix
	->where("t.closed_date < CURRENT_DATE")
;

//-----------------------------------------------------
// Filter the search query
//-----------------------------------------------------

//Handle exact fields
$selects = [ 'asset_id' => 'a.id' ];
foreach($selects as $name => $field):
	if(!empty($_GET[$name])):
		$query->andWhere($field . " = ?")->addParam(intval($_GET[$name]));
	endif;
endforeach;

//-----------------------------------------------------
// Build the totals query
//-----------------------------------------------------
$totals = clone $query;
$totals
	->clearSelect()
	->clearOrderBy()
	->paginate(false)
	->select("count(*)", "assets")
	->select("sum(p.purchase_price)", "purchase_price")
	->select("sum(p.closing_deal_expenses)", "closing_costs")
	->select("sum((p.purchase_price - p.closing_deal_expenses))::numeric(12,2)", "new_cost_basis")
;

$amort_summary = $totals->execute()->getRow();

//-----------------------------------------------------
// Add month buckets
//-----------------------------------------------------
$input = $form->getValue();
$months = range(1, 12);

$date = new DateTime($input['anchor_date'] ?: 'now');

$interval = new DateInterval('P1M');

foreach($months as $month):
	$query
		->select("
				CASE
					WHEN a.rent_commencement_date <= ?
					THEN (p.purchase_price / to_months(p.purchase_term))::numeric(12,2)
					ELSE 0
				END",  $date->format("M Y"), ["field_class" => "Money"]
		)
		->addParam($date->format("Y-m-d"))
	;
	$date->add($interval);
endforeach;

// Build the result set
$ds = $query->returnDataSet();
$ds->enableMultisort();

$format = new FormatMoney
?>

<fieldset>
	<legend>Advanced Search - Asset Amortization Report<span class="tooltip" title="To perform wildcard searches, please use the % character."></span></legend>
	<?=$form;?>
</fieldset>

<fieldset class="relative">
	<legend>Amortization Summary</legend>
	<table class="table center bold overview top" style="font-size: 1.2em">
		<tbody>
			<tr>
				<td>Assets<br/><h2><?=number_format($amort_summary['assets']);?></h2></td>
				<td>Purchase Price<br/><h2><?=$format->html($amort_summary['purchase_price']);?></h2></td>
				<td>Closing Costs<br/><h2><?=$format->html($amort_summary['closing_costs']);?></h2></td>
				<td>New Cost Basis<br/><h2><?=$format->html($amort_summary['new_cost_basis']);?></h2></td>
			</tr>
		</tbody>
	</table>
</fieldset>

<?
print $ds;