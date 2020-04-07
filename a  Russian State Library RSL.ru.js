{
	"translatorID": "26ce1cb2-07ec-4d0e-9975-ce2ab35c8343",
	"label": "a  Russian State Library RSL.ru",
	"creator": "PChemGuy",
	"target": "^https://search\\.rsl\\.ru",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2020-04-07 10:22:27"
}

/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2020 PChemGuy

	This file is part of Zotero.

	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero. If not, see <http://www.gnu.org/licenses/>.

	***** END LICENSE BLOCK *****
*/


function detectWeb(doc, url) {
	// Test url: https://search.rsl.ru/ru/record/01003395841
	Z.debug('----------------------------------');
	Z.debug('URL: ' + url);
	Z.debug('.documentURI: ' + doc.documentURI);
	Z.debug('\n' + '.cookie:\t\t\t\t\t' + doc.cookie + '\n');

	Z.debug('\n' +
	        'Expected:\t\t\t\thttps://search.rsl.ru/ru/record/01003395841' + '\n' +
	        '.documentURI:\t\t\t' + doc.documentURI + '\n' +
	        '.URL:\t\t\t\t\t' + doc.URL + '\n'
	        );
	
	Z.debug('\n' +
	        'Expected:\t\t\t\tsearch.rsl.ru' + '\n' +
	        '.domain:\t\t\t\t\t' + doc.domain + '\n');
	
	let marc_table_div_id = 'marc-rec';
	Z.debug('\n' +
	        'Expected:\t\t\t\trsl-marc-record' + '\n' +
	        '.getElementById:\t\t\t' + doc.getElementById(marc_table_div_id).getAttribute("class") + '\n');

	let marc_table_div_class = 'rsl-marc-record';
	Z.debug(doc.getElementsByClassName(marc_table_div_class)[0].getAttribute("id"));
	Z.debug('\n' +
	        'Expected:\t\t\t\tmarc-rec' + '\n' +
	        '.getElementsByClassName:\t' + doc.getElementsByClassName(marc_table_div_class)[0].getAttribute("id") + '\n');


	Z.debug('----------------------------------');
	if (url.indexOf("/search#q") != -1) {
		return "multiple";
	} else if (url.indexOf("/record/") != -1) {
		return getDocType(doc);
	}
	return false;
}

function getDocType(doc, url) {
	return "journalArticle";
}
