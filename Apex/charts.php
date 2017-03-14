<?php
use Format\FormatStatus;

use Format\FormatChainedLink;
use Format\FormatCallable;
use Format\FormatInterval;
use Format\FormatYesNo;
use Format\FormatDate;
use Format\FormatNumber;
use Format\FormatMoney;
use Format\FormatLink;
use Format\FormatTruncate;
use WCP\IssueTracker;
use HTML\Element;
use WCP\NDA;
use HTML\Form\Field\Link;
use Aura\Di\Container as Injector;

/**
 * Just a simple utility class for rendering certain charts
 */
class Charts {

	/**
	 * Filter used for processing pipeline
	 */
	const PROCESSING_PIPELINE_FILTER = 'BETWEEN 1 AND 13';

	/**
	 * Builds a column chart that represents the processing pipeline
	 */
	static function renderDashboard(){

		$fmt_money = new FormatMoney;
		$fmt_money->setPrecision(0);

		$processing_pipeline_count = new Query;
		$processing_pipeline_count
			->select("count(v.*)", "count")
			->select("sum(p.purchase_price)", "sum_pp")
			->select("sum(p.first_year_rent)", "sum_fyr")
			->from("transactions", "t")
			->join("statuses", "st", "ON st.id = t.status_id AND st.id ". self::PROCESSING_PIPELINE_FILTER )
			->join("user_visible_assets_view", "v", "ON v.asset_id = t.asset_id AND v.user_id = ?")->addParam($_SESSION['user_id'])
			->leftjoin("proposals", "p", "ON p.transaction_id = t.id AND p.is_operative")
		;

		$query = new Query;
		$query
			->select("st.abbrev", "key")
			->select("st.name", "name")
			->select("st.id", "status_id")
			->select("count(v.*)", "y")
			->select("sum(CASE WHEN v.asset_id IS NOT NULL THEN e.purchase_price ELSE 0 END)", "purchase_price")
			->select("sum(CASE WHEN v.asset_id IS NOT NULL THEN e.first_year_rent ELSE 0 END)", "first_year_rent")
			->select("CASE
						WHEN st.abbrev = 'PA' THEN '#64963F'
						WHEN st.abbrev IN ('DD', 'AU') THEN '#990000'
						WHEN st.abbrev = 'DO' THEN '#9B88C4'
						WHEN st.abbrev = 'DB' THEN '#4572A7'
						WHEN st.abbrev IN ('DQ', 'IC') THEN '#B6B6B6'
						ELSE '#4572A7' END", "color")
			->from("statuses", "st")
			->leftJoin("transactions", "t", "ON st.id = t.status_id")
			->leftJoin("assets", "a", "ON a.id = t.asset_id")
			->leftJoin("user_visible_assets_view", "v", "ON v.asset_id = a.id AND v.user_id = ?")->addParam($_SESSION['user_id'])
			->leftJoin("proposals", "e", "ON e.transaction_id = t.id AND e.is_operative")
			->where("st.id " . self::PROCESSING_PIPELINE_FILTER)
			->groupBy(1)
			->groupBy(2)
			->groupBy(3)
			->orderBy("st.order")
		;

		$counts = $processing_pipeline_count->execute()->getRow();
		$res = $query->execute()->getKeyPair();

		$data =  $res;

		$out = "";
		$id = Element::generateElementId();

		ob_start();

?>
<div class="block" id="<?=$id;?>">
	<script>
		$(function(){

			var chart = new Highcharts.Chart({
				chart: {
					renderTo: '<?=$id;?>',
					type: 'column',
					height: 204,
					spacingRight: 0,
					spacingLeft: 0
				},
				colors: [
					'#4572A7',
					'#E2302F'
				],
				title: { text: false },
				xAxis: {
					categories: <?=json_encode(array_keys($data));?>,
					gridLineColor: '#C0D0E0',
					gridLineWidth: 1,
					gridLineDashStyle: 'ShortDot'
				},
				legend: { enabled: false },
				plotOptions: {
					series: {
						dataLabels: {
							align: 'center',
							enabled: true,
							y: -6,
							color: '#000000',
							formatter: function(){
								var price = this.point.purchase_price || 0;
								var rent = this.point.first_year_rent || 0;
								return "<b>" + this.y + "</b>" +
									'<span style="fill: green;">($' + number_format(rent / 1000) + "K)</span>";
							}
						}
					},
					column: {
						groupPadding: 0,
						pointPadding: 0.08,
						cursor: 'pointer',
						point: {
							events: {
								click: updateDashboardBucket
							}
						}
					}
				},
				tooltip: {
					formatter: function() {
						return this.point.name + '<br />' +
							'<span style="fill: #4562A7">Assets</span>: <b>' + this.y + '</b>' + '<br />' +
							'<span style="fill: #4562A7">1st Year Rent</span>: <span style="fill: green;">$' + number_format(this.point.first_year_rent) + '</span>' + '<br />' +
							'<span style="fill: #4562A7">Purchase Price</span>: <span style="fill: green;">$' + number_format(this.point.purchase_price) + '</span>';
					}
				},
				yAxis: {
					title: { text: 'Number of Assets' },
					labels: { enabled: false},
					gridLineColor: '#FFFFFF'
				},

				series: [
					{data: <?=json_encode(array_values($data)); ?>}
				]

			});

			$("#<?=$id;?>").data().chart = chart;

		});
	</script>
</div>
<?php
	$out = ob_get_contents();
	ob_end_clean();

	return [$counts,  $out];

	}

	/**
	* Outputs the dashboard detail grid and handles ajax requests for detail info
	*/
	static function renderDashboardDetail(){

		$fmt_number = new FormatNumber;
		$fmt_number->setPositiveClass('zero');

		$fmt_money = new FormatMoney;
		$fmt_money->setPrecision(0);

		$fmt_rednumber = new FormatNumber;
		$fmt_rednumber->setPositiveClass('negative bold');

		$contents = "";

		//Handle the ajax detail request if present
		if(!empty($_REQUEST['ajax_bucket'])):

			//On POST requests, clean out the buffer. On GET requests, start a new one
			if($_POST):
				ob_end_clean();
			else:
				ob_start();
			endif;

			$filter = self::PROCESSING_PIPELINE_FILTER;
			if(!empty($_REQUEST['status_id']) && $_REQUEST['status_id'] == 17) $filter = " = 17";

			$query = new Query;
			$query
				->select("t.id", "transaction_id", array("is_visible" => false))
				->select("a.id", "WCPID", array('formatter' => new FormatLink("profile/?asset_id={WCPID}&transaction_id={TRANSACTION_ID}")))
				->select("a.name", null, ["formatter" => new FormatTruncate(30)])
				->select("t.status_id", "Status", array('formatter' => new FormatStatus))
				->select("e.first_year_rent", "1st Yr. Rent", ["formatter" => $fmt_money])
				->select("e.purchase_price", null, ["formatter" => $fmt_money])

				// Missing transaction checklist items
				->select("(
					SELECT
						SUM((NOT s.is_satisfactory AND p.is_required)::integer) AS is_missing
					FROM
						transaction_has_checklist_items tci
						JOIN checklist_items i ON i.id = tci.checklist_item_id
						JOIN checklist_statuses s ON s.id = tci.checklist_status_id
						JOIN program_has_checklist_items p ON p.program_id = t.program_id AND p.checklist_item_id = tci.checklist_item_id
					WHERE
						tci.transaction_id = t.id
					)", "Missing", array('formatter' => new FormatChainedLink($fmt_rednumber, "profile/checklist/index?asset_id={WCPID}&transaction_id={TRANSACTION_ID}")))

				->select("(
						SELECT count(*) FROM transaction_has_issues thi
						JOIN issues i ON i.id = thi.issue_id
						WHERE i.completed_timestamp IS NULL
						AND thi.transaction_id = t.id
					)", "Issues", array('formatter' => new FormatChainedLink($fmt_rednumber, "issues/index?asset_id={WCPID}&transaction_id={TRANSACTION_ID}")))

				// Select Open NDAs, ROFR & Consent
				->select("(
						SELECT count(*)
						FROM ndas
						JOIN nda_statuses ns ON ns.id = ndas.status_id
						WHERE
							ndas.transaction_id = t.id
							AND NOT ns.is_satisfactory
				)", "NDAs", array('formatter' => new FormatChainedLink($fmt_rednumber, "profile/edit?asset_id={WCPID}&transaction_id={TRANSACTION_ID}&tab=Processing&section=ndas")))
				->select("(
						SELECT CURRENT_DATE - thi.created_timestamp::date
						FROM transaction_has_issues thi
						JOIN issues i ON i.id = thi.issue_id
						WHERE i.issue_category_id = 10
						AND i.completed_timestamp IS NULL
						AND thi.transaction_id = t.id
						LIMIT 1
				)", "ROFR", ["formatter" => $fmt_number])
				->select("(
						SELECT CURRENT_DATE - thi.created_timestamp::date
						FROM transaction_has_issues thi
						JOIN issues i ON i.id = thi.issue_id
						WHERE i.issue_category_id = 8
						AND i.completed_timestamp IS NULL
						AND thi.transaction_id = t.id
						LIMIT 1
				)", "Consent", ["formatter" => $fmt_number])

				->select("t.option_period_expiration_date - CURRENT_DATE", "Opt. Exp.", array('formatter' => new FormatNumber))
				->from("assets", "a")
				->join("transactions", "t", "ON t.asset_id = a.id")
				->join("opportunities", "o", "ON o.id = t.opportunity_id")
				->join("user_visible_assets_view", "v", "ON v.asset_id = a.id AND v.user_id = ?")->addParam($_SESSION['user_id'])
				->leftjoin("proposals", "e", "ON e.transaction_id = t.id AND e.is_operative")
				->where("t.status_id " . $filter)
				->orderBy('t.option_period_expiration_date - CURRENT_DATE', 'asc')
				->orderBy('e.first_year_rent', 'desc')
				->orderBy(1)
			;

			$db = $query->getDB();
			$res = $db->execute("SELECT id, abbrev FROM statuses WHERE next_status_id IS NOT NULL AND pipeline = 'P' ORDER BY id");

			//Create a custom number formatter for the status buckets
			$callable = new FormatCallable(function($value) use ($fmt_number){
				$parts = explode('|', $value);
				if(!empty($parts[1])) return "<span class='dashboard-number-highlight'>" . $fmt_number->html($parts[0]) . "</span>";
				return $fmt_number->html($parts[0]);
			});

			//Add status buckets
			foreach($res as $row):
				$query
					->select("
						(
							SELECT days || '|' || (still_aging::integer)
							FROM transaction_status_aging(t.id)
							WHERE status_id = " . $row['id']."
						)",
						$row['abbrev'],
						['formatter' => $callable, 'add_classes' => 'float-right']
					)
				;
			endforeach;

			//Add additional fields
			$query
				->select("o.lease_consultant_id", "Consultant")
				->select("t.processor_id", "Closer");

			if(!empty($_REQUEST['status_id'])):
				$query->where("t.status_id = ?")->addParam(intval($_REQUEST['status_id']));
			endif;

			if(!empty($_REQUEST['issue_category_id'])):

				//Filter by a certain category?
				$extra = "";
				if(intval($_REQUEST['issue_category_id'])):
					$extra = "AND i.issue_category_id = ?";
					$query->addParam(intval($_REQUEST['issue_category_id']));
				endif;

				$query->where("EXISTS (
					SELECT 1
					FROM transaction_has_issues thi
					JOIN issues i ON i.id = thi.issue_id
					WHERE
						thi.transaction_id = t.id
						AND i.completed_timestamp IS NULL
						".$extra."
				)");

			endif;

			$dataset = $query->returnDataSet()->setAttribute("style", "font-size: 90%");

		?>
			<table width="100%" class="baseline">
				<tr>
					<td><h2 class=""><?=$_REQUEST['name'];?> Bucket</h2></td>
					<td class="right"><a href="#" class="icon close subtitle event" data-click-handler="function(e){$('#dashboard-detail').fadeOut(function(){$(window).trigger('resize')}); return false;}">Close this Bucket</a></td>
				</tr>
			</table>
			<?php
			print $dataset;
			if($_POST):
				exit;
			else:
				$contents = ob_get_contents();
				ob_end_clean();
			endif;
		endif;

		$classes = "shadowbox block";
		if(empty($_REQUEST['ajax_bucket'])):
			$classes .= " hidden";
		endif;

		return '<div id="dashboard-detail" class="'.$classes.'">'.$contents.'</div>';

	}


	static function renderSuspended(){

		// adjust this query to JUST suspended values
		$query = new Query;
		$query
			->select("st.abbrev", "key")
			->select("st.name", "name")
			->select("st.id", "status_id")
			->select("count(v.*)", "y")
			->select("sum(CASE WHEN v.asset_id IS NOT NULL THEN e.purchase_price ELSE 0 END)", "purchase_price")
			->select("sum(CASE WHEN v.asset_id IS NOT NULL THEN e.first_year_rent ELSE 0 END)", "first_year_rent")
			->select("'#4572A7'", "color")
			->from("statuses", "st")
			->leftJoin("transactions", "t", "ON st.id = t.status_id")
			->leftJoin("assets", "a", "ON a.id = t.asset_id")
			->leftJoin("user_visible_assets_view", "v", "ON v.asset_id = a.id AND v.user_id = ?")->addParam($_SESSION['user_id'])
			->leftJoin("proposals", "e", "ON e.transaction_id = t.id AND e.is_operative")
			->where("st.id = 17" )
			->groupBy(1)
			->groupBy(2)
			->groupBy(3)
			->orderBy("st.order")
		;

		$res = $query->execute()->getKeyPair();

		$count = $res['S']['y'];

		$data =  $res;

		$out = "";
		$id = Element::generateElementId();

		ob_start();

	?>
	<div class="block" id="<?=$id;?>">
		<script>
			$(function(){

				var chart = new Highcharts.Chart({
					chart: {
						renderTo: '<?=$id;?>',
						type: 'column',
						height: 204,
						spacingRight: 0,
						spacingLeft: 0
					},
					colors: [
						'#4572A7',
						'#E2302F'
					],
					title: { text: false },
					xAxis: {
						categories: <?=json_encode(array_keys($data));?>,
						gridLineColor: '#C0D0E0',
						gridLineWidth: 1,
						gridLineDashStyle: 'ShortDot'
					},
					legend: { enabled: false },
					plotOptions: {
						series: {
							dataLabels: {
								align: 'center',
								enabled: true,
								y: -6,
								color: '#000000',
								formatter: function(){
									var price = this.point.purchase_price || 0;
									var rent = this.point.first_year_rent || 0;
									return "<b>" + this.y + "</b>" +
										'<span style="fill: green;">($' + number_format(rent / 1000) + "K)</span>";
								}
							}
						},
						column: {
							groupPadding: 0,
							pointPadding: 0.08,
							cursor: 'pointer',
							point: {
								events: {
									click: updateDashboardBucket
								}
							}
						}
					},
					tooltip: {
						formatter: function() {
							return this.point.name + '<br />' +
								'<span style="fill: #4562A7">Assets</span>: <b>' + this.y + '</b>' + '<br />' +
								'<span style="fill: #4562A7">1st Yr</span>: <span style="fill: green;">$' + number_format(this.point.first_year_rent) + '</span>' + '<br />' +
								'<span style="fill: #4562A7">Price</span>: <span style="fill: green;">$' + number_format(this.point.purchase_price) + '</span>';
						}
					},
					yAxis: {
						title: { text: 'Number of Assets' },
						labels: { enabled: false},
						gridLineColor: '#FFFFFF'
					},

					series: [
						{data: <?=json_encode(array_values($data)); ?>}
					]

				});

				$("#<?=$id;?>").data().chart = chart;

			});
		</script>
	</div>
	<?php

		$out = ob_get_contents();
		ob_end_clean();
		return [$count, $out];

	}


	static function renderIssues(){

		$db = Registry::getDatabase();
		$count = $db->getOne("
					SELECT count(v.*)
					FROM issues i
					JOIN transaction_has_issues thi ON thi.issue_id = i.id
					JOIN transactions t ON t.id = thi.transaction_id AND t.status_id NOT IN (15, 16)
					JOIN user_visible_assets_view v ON v.asset_id = t.asset_id AND v.user_id = ? --Permission check
					WHERE i.completed_timestamp IS NULL
				", [$_SESSION['user_id']]
		);

		//Deals with attributes
		$query = new Query;
		$query
			->select("c.abbrev", "key")
			->select("c.id", "issue_category_id")
			->select("c.name", "name")
			->select("count(v.*)", "y")
			->select("sum(CASE WHEN v.asset_id IS NOT NULL THEN e.purchase_price ELSE 0 END)", "purchase_price")
			->select("sum(CASE WHEN v.asset_id IS NOT NULL THEN e.first_year_rent ELSE 0 END)", "first_year_rent")
			->select("'#9DC87C'", "color")
			->from("issue_categories", "c")
			->leftJoin("issues", "i", "ON i.issue_category_id = c.id AND i.completed_timestamp IS NULL")
			->leftJoin("transaction_has_issues", "thi", "ON i.id = thi.issue_id")
			->leftJoin("transactions", "t", "ON t.id = thi.transaction_id AND t.status_id NOT IN (15, 16)")
			->leftJoin("user_visible_assets_view", "v", "ON v.asset_id = t.asset_id AND v.user_id = ?")->addParam($_SESSION['user_id'])
			->leftJoin("proposals", "e", "ON e.transaction_id = t.id AND e.is_operative")
			->where("c.abbrev IS NOT NULL")
			->groupBy(1)->groupBy(2)->groupBy(3)
			->orderBy("c.order")
		;

		$data = $query->execute()->getKeyPair();

		$out = "";
		$id = Element::generateElementId();

		ob_start();


		?>
		<div id="<?=$id;?>">
			<script>
				$(function(){

					var chart = new Highcharts.Chart({
						chart: {
							renderTo: '<?=$id;?>',
							type: 'column',
							height: 204,
							spacingBottom: 2,
							spacingRight: 0,
							spacingLeft: 0
						},
						colors: [
							'#4572A7',
							'#E2302F'
						],
						title: { text: false },
						xAxis: {
							categories: <?=json_encode(array_keys($data));?>,
							gridLineColor: '#C0D0E0',
							gridLineWidth: 1,
							gridLineDashStyle: 'ShortDot'
						},
						legend: { enabled: false },
						plotOptions: {
							series: {
								dataLabels: {
									align: 'center',
									enabled: true,
									y: -6,
									color: '#000000',
									formatter: function(){
										var price = this.point.purchase_price || 0;
										var rent = this.point.first_year_rent || 0;
										return "<b>" + this.y + "</b>" +
											'<span style="fill: green;">($' + number_format(rent / 1000) + "K)</span>";
									}
								}
							},
							column: {
								groupPadding: 0,
								pointPadding: 0.08,
								cursor: 'pointer',
								point: {
									events: {
										click: updateDashboardBucket
									}
								}
							}
						},
						tooltip: {
							formatter: function() {
								return this.point.name + '<br />' +
									'<span style="fill: #4562A7">Assets</span>: <b>' + this.y + '</b>' + '<br />' +
									'<span style="fill: #4562A7">1st Year Rent</span>: <span style="fill: green;">$' + number_format(this.point.first_year_rent) + '</span>' + '<br />' +
									'<span style="fill: #4562A7">Purchase Price</span>: <span style="fill: green;">$' + number_format(this.point.purchase_price) + '</span>';
							}
						},
						yAxis: {
							title: { text: 'Number of Assets' },
							labels: { enabled: false},
							gridLineColor: '#FFFFFF'
						},

						series: [
							{data: <?=json_encode(array_values($data)); ?>}
						]

					});

					$("#<?=$id;?>").data().chart = chart;

				});
			</script>
		</div>
		<?php

			$out = ob_get_contents();
			ob_end_clean();
			return [$out, $count];

	}

	/**
	* Outputs the dashboard detail grid and handles ajax requests for detail info
	*/
	static function renderIssuesDetail(){

		$fmt_number = new FormatNumber;
		$fmt_number->setPositiveClass('zero');

		$fmt_money = new FormatMoney;
		$fmt_money->setPrecision(0);

		$fmt_rednumber = new FormatNumber;
		$fmt_rednumber->setPositiveClass('negative bold');

		$trunc = new FormatTruncate(20);

		$injector = Registry::getInjector();
		$qs = $injector->get('qs');

		$contents = "";

		//Handle the ajax detail request if present
		if(!empty($_REQUEST['ajax_bucket'])):

			//On POST requests, clean out the buffer. On GET requests, start a new one
			if($_POST):
				ob_end_clean();
			else:
				ob_start();
			endif;

			$query = new Query;
			$query
				->select("i.id", "issue_id", ["is_visible" => false])
				->select("t.id", "transaction_id", array("is_visible" => false))
				->select("a.id", "WCPID", array('formatter' => new FormatLink(WEB_PATH . "profile/?asset_id={WCPID}&transaction_id={TRANSACTION_ID}")))
				->select("a.name", null, ["formatter" => $trunc])
				->select("t.status_id", "Status", array('formatter' => new FormatStatus))
				->select("e.first_year_rent", "1st Yr. Rent", ["formatter" => $fmt_money])
				->select("e.purchase_price", null, ["formatter" => $fmt_money])
				->select("i.name", "Issue", ["field_class" => "Link", "truncate_to" => 20, "url" => WEB_PATH . "issues/detail" . $qs->replace(array("asset_id" => "{WCPID}", "issue_id" => "{ISSUE_ID}", "transaction_id" => "{TRANSACTION_ID}" ))])
				->select("i.created_timestamp", "Created", array("formatter" => new FormatDate))
				->select("i.target_date", "Target")
				->select("o.lease_consultant_id", "Consultant")
				->select("i.assigned_to", "Assigned To")
				->select("i.issue_category_id", null, ["formatter" => $trunc])
				->from("transaction_has_issues", "thi")
				->join("issues", "i", "ON i.id = thi.issue_id")
				->join("transactions", "t", "ON t.id = thi.transaction_id")
				->join("opportunities", "o", "ON o.id = t.opportunity_id")
				->join("user_visible_assets_view", "v", "ON v.asset_id = t.asset_id AND v.user_id = ?")->addParam($_SESSION['user_id'])
				->join("assets", "a", "ON a.id = t.asset_id")
				->leftjoin("proposals", "e", "ON e.transaction_id = t.id AND e.is_operative")
				->where("t.status_id NOT IN (15, 16)")
				->andWhere("i.completed_timestamp IS NULL")
				->makeSortable()
				->orderBy('e.first_year_rent', 'desc')
				->orderBy(1)
			;

			if(!empty($_REQUEST['status_id'])):
				$query->where("t.status_id = ?")->addParam(intval($_REQUEST['status_id']));
			endif;

			if(!empty($_REQUEST['issue_category_id'])):

				//Filter by a certain category?
				$extra = "";
				if(intval($_REQUEST['issue_category_id'])):
					$extra = "AND i.issue_category_id = ?";
					$query->addParam(intval($_REQUEST['issue_category_id']));
				endif;

				$query->where("EXISTS (
					SELECT 1
					FROM transaction_has_issues thi
					JOIN issues i ON i.id = thi.issue_id
					WHERE
						thi.transaction_id = t.id
						AND i.completed_timestamp IS NULL
						".$extra."
				)");

			endif;



			$dataset = $query->returnDataSet();

			//Build an edit link
			if($dataset):
			$dataset->addChild(
					with($foo = new Link)
					->setLabel("Edit")
					->setUrl("edit" . $qs->replace(array("issue_id" => "{ISSUE_ID}" , "asset_id" => "{WCPID}", "transaction_id" => "{TRANSACTION_ID}")))
					->addClass("icon edit")
					->setValue('Edit')
			);
			endif;

		?>
			<table width="100%" class="baseline">
				<tr>
					<td><h2 class=""><?=$_REQUEST['name'];?> Bucket</h2></td>
					<td class="right"><a href="#" class="icon close subtitle event" data-click-handler="function(e){$('#dashboard-detail').fadeOut(function(){$(window).trigger('resize')}); return false;}">Close this Bucket</a></td>
				</tr>
			</table>
			<?php
			print $dataset;
			if($_POST):
				exit;
			else:
				$contents = ob_get_contents();
				ob_end_clean();
			endif;
		endif;

		$classes = "shadowbox block";
		if(empty($_REQUEST['ajax_bucket'])):
			$classes .= " hidden";
		endif;

		return '<div id="dashboard-detail" class="'.$classes.'">'.$contents.'</div>';

	}

	/**
	 * Builds a gantt chart for output
	 * @param string $title Chart title
	 * @param string $subtitle Chart subtitle
	 * @param array $data in (label => array(string date, string date)) format
	 */
	static function renderGantt($title, $subtitle=null, $data = array()){

		$out = "";
		$id = Element::generateElementId();

		$first = current($data);

		$items = array();
		foreach($data as $dates):
		$items[] = array(
				'low' => strtotime($dates[0] . " UTC") * 1000,
				'y' => strtotime($dates[1] . " UTC") * 1000
		);
		endforeach;

		ob_start();

?>
<div class="chart" id="<?=$id;?>">
	<script>
		$(function(){

			var chart = new Highcharts.Chart({
				chart: {
					renderTo: '<?=$id;?>',
					type: 'bar'
				},
				title: { text: '<?=addcslashes($title, "'");?>' },
				subtitle: { text: '<?=addcslashes($subtitle, "'");?>' },
				xAxis: { categories: <?=json_encode(array_keys($data));?> },
				legend: { enabled: false },
				plotOptions: { series: { dataLabels: { enabled: false } } },

				yAxis: {
					type: 'datetime',
					min: <?=strtotime($first[0]) * 1000;?>,
					dateTimeLabelFormats: {
						week: "%b %e, '%y"
					},
					labels: { x: -12, y: 28, rotation: -45 },
					title: { text: null }
				},

				tooltip: {
					formatter: function() {
						var diff = (this.point.y - this.point.low) / 1000; //In seconds

						return '<b>' + this.point.category + '</b><br/>' + (
							diff < 60 && diff + " seconds" ||
							diff < 120 && "1 minute" ||
							diff < 3600 && Math.floor( diff / 60 ) + " minutes" ||
							diff < 7200 && "1 hour" ||
							diff < 3600 * 23 && Math.floor( diff / 3600 ) + " hours" ||
							diff < 86400 && "1 day" ||
							diff < 86400 * 30 && Math.floor( diff / 86400) + " days" ||
							Math.floor( diff / (86400 * 7) ) + " weeks"
						);
					}
				},

				series: [{
					data: <?=json_encode($items); ?>
				}]

			});

			$("#<?=$id;?>").data().chart = chart;

		});
	</script>
</div>
<?php

	$out = ob_get_contents();
	ob_end_clean();
	return $out;

	}

}