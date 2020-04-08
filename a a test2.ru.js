{
	"translatorID": "26ce1cb2-07ec-4d0e-9975-ce2ab35c8343",
	"label": "a a test2.ru",
	"creator": "PChemGuy",
	"target": "^https://search\\.rsl\\.ru",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2020-04-08 07:08:12"
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


function attr(docOrElem, selector, attr, index) {
	var elem = index ? docOrElem.querySelectorAll(selector).item(index) : docOrElem.querySelector(selector);
	return elem ? elem.getAttribute(attr) : null;
}


function text(docOrElem, selector, index) {
	var elem = index ? docOrElem.querySelectorAll(selector).item(index) : docOrElem.querySelector(selector);
	return elem ? elem.textContent : null;
}


function detectWeb(doc, url) {
	Zotero.debug(url);
	var marc_rows = doc.querySelectorAll('div#marc-rec > table > tbody > tr'); 
	Zotero.debug(text(marc_rows[7], 'td', 1));
	
	if (url.indexOf("/search#q=") != -1) {
		return "multiple";
	} else if (url.indexOf("/record/") != -1) {
		return "book";
	}
	return false;
}


function doWeb(doc, url) {
	if (detectWeb(doc, url) == "multiple") {
		Zotero.selectItems(getSearchResults(doc, false),
						function (items) {
							if (items) ZU.processDocuments(Object.keys(items), scrape);
						}
		);
	}
	else {
		scrape(doc, url);
	}
}


function getSearchResults(doc, checkOnly) {
	var items = {};
	var found = false;
	// TODO: adjust the CSS selector
	var rows = doc.querySelectorAll('h2>a.title[href*="/article/"]');
	for (let row of rows) {
		// TODO: check and maybe adjust
		let href = row.href;
		// TODO: check and maybe adjust
		let title = ZU.trimInternal(row.textContent);
		if (!href || !title) continue;
		if (checkOnly) return true;
		found = true;
		items[href] = title;
	}
	return found ? items : false;
}


function getMARCXML(doc, url) {
	const marc_table_div_selector = 'div#marc-rec > table';
	let irow = 0;

	let marc21_table_rows = doc.querySelector(marc_table_div_selector).rows;
	let marcxml_lines = [];

	marcxml_lines.push(
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<record xmlns="http://www.loc.gov/MARC21/slim" type="Bibliographic">',
		'    <leader>' + marc21_table_rows[0].cells[1].innerText.replace(/#/g, ' ') + '</leader>'
	);
	irow++;
	
	for (irow; irow < marc21_table_rows.length; irow++) {
		let cur_cells = marc21_table_rows[irow].cells;
		let field_tag = cur_cells[0].innerText;
		if (Number(field_tag) > 8) { break; }
		let field_val = cur_cells[1].innerText;
		marcxml_lines.push(
			'    <controlfield tag="' + field_tag + '">' + field_val.replace(/#/g, ' ') + '</controlfield>'
		);
	}
	
	for (irow; irow < marc21_table_rows.length; irow++) {
		let cur_cells = marc21_table_rows[irow].cells;
		let field_tag = cur_cells[0].innerText;
		cur_cells[1].innerHTML = cur_cells[1].innerHTML.replace(/>\$/g, '>$$$$$$');
		field_val = cur_cells[1].innerText;
		cur_cells[1].innerHTML = cur_cells[1].innerHTML.replace(/\$\$\$/g, '$$');
		let inds = field_val.slice(0, 2).replace(/#/g, ' ');
		field_val = field_val.slice(5);
		let subfields = field_val.split('$$$');
		marcxml_lines.push(
			'    <datafield tag="' + field_tag + '" ind1="' + inds[0] + '" ind2="' + inds[1] + '">'
		);
		for (let isubfield = 0; isubfield < subfields.length; isubfield++) {
			subfield = subfields[isubfield].replace(/\s/, '\x01').split('\x01');
			marcxml_lines.push(
				'        <subfield code="' + subfield[0] + '">' + subfield[1] + '</subfield>'
			);
		}
		marcxml_lines.push(
			'    </datafield>'
		);
	}

	marcxml_lines.push(
		'</record>'
	);
	
	return marcxml_lines.join('\n');
}
