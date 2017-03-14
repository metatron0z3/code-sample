# Code Sample for Maurice Stephens

## Apex

Apex was an in house financial application for a company working in the cell tower lease business. There was no framework used.

lockboxparser.php - was used to parse the line items from a digital checkbox from Wells Fargo. Checks would come in from multiple wireless carriers (Sprint, Verizon etc) and checks would have from 30-50 line items each intended to be routed to a different account or property... and there was no consistency between carriers how those line items would be formatted. We had to rely on the accounting department's existing experience to set up up a logic stream that would route each check and sub-amount correctly. We accomplished this using a priority_queue object and lots of preg_match() comparisons.

activitymodule.php - was one of the scripts in the application search page. "activities" were one of the parameters by which users could search existing deals. This could have been cleaner had we been using an ORM but it was not available in this case.

charts.php - was a simple highcharts.js dashboard page set up for the accounting department.

## Troop

Troop is a Group Collaboration and next generation social sharing platform written in Node and Angular.  

Table.js was the Angular controller for the Table View, one of the 5 main views by which a user could view a board. It utilized both header and manual sortable options and used Angular's $watch & $broadcast features to update changes across all views of that board for all users looking at that board in real time. 

TroopApi.js was our client side handle to the backend api scripts.

RightSidebar.js was a 3 column view that showed members of a particular board (including their permission level), all tags associated with that particular board and all file assets in that board. 
