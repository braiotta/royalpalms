#!/usr/bin/php -q
<?php
date_default_timezone_set('US/Eastern');

$_POST = array(
	'function'		=> 'testConfig',
	'config_name'	=> 'config.txt'
);

require('./party.php');