{
	"translatorID": "68015def-0e1f-4488-bbd6-36dba1ed7731",
	"label": "a a CNTD.ru",
	"creator": "PChemGuy",
	"target": "https?://docs.cntd.ru/",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2020-04-16 18:34:37"
}

/*
	***** BEGIN LICENSE BLOCK *****

	Copyright В© 2020 PChemGuy

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

/*
	A provider of legislative, technical, and regulatory documents in Russian.
	With primery focus on documents produced by Russian authorities, CNTD also
	serves translated into Russian foreign and international documents applicable
	to activities in Russia.  
*/


const filters = {
	metadataTableCSS: "div#tab-content2-low > div.document > table.status",
	pdfKeyScriptCSS: "div#page-wrapper > script:nth-child(2)"
};

const keywords = {
	activeLaw: "Действующий",
	codeAmendments: "(с изменениями на",
	codeVersion: "(редакция"
};

// Holds extracted metadata
var metadata = {};

var fieldMap = {
	"Название документа": "title",
	"Номер документа": "publicLawNumber",
	"Вид документа": "codeNumber",
	"Принявший орган": "legislativeBody",
	Статус: "legalStatus",
	Опубликован: "published",
	"Дата принятия": "dateApproved",
	"Дата начала действия": "dateEnacted",
	"Дата редакции": "dateAmended",
	"Дата окончания действия": "dateRevoked"
};

const documentTypes = {
	ГОСТ: { type:"standard", itemType: "report", short: "ГОСТ", abbr: "ГОСТ" },
	"ГОСТ Р": { type:"standard", itemType: "report", short: "ГОСТ Р", abbr: "ГОСТ Р" }, 
	"Указ Президента РФ": { type:"order", itemType: "statute", short: "Указ", abbr: "Указ" },
	"Федеральный закон": { type:"federalLaw", itemType: "statute", short: "Федеральный закон", abbr: "ФЗ" },
	"Кодекс РФ": { type:"code", itemType: "statute", short: "Кодекс РФ", abbr: "Кодекс РФ" }
};

const legislativeBodies = [
	"Росстандарт",
	"Президент РФ"
];
	


/**
 *	Adds link attachment to a Zotero item.
 *
 *	@param {Object} item - Zotero item
 *	@param {String} title - Link name
 *	@param {String} url - Link url
 *
 *	@return {None}
 */
function addLink(item, title, url) {
	item.attachments.push({ linkMode: "linked_url", // Apparently, should be the first
		title: title,
		snapshot: false,
		contentType: "text/html",
		url: url });
}


function detectWeb(doc, url) {
	let domain = url.match(/^https?:\/\/([^/]+)/)[1];
	let pathname = doc.location.pathname;
	let searchPattern = '/search/intellectual';
	let recordPattern = /^\/document\/([0-9]+)/;

	if (pathname.includes(searchPattern)) {
		return 'multiple'; 
	}
	
	if (pathname.match(recordPattern)) {
		metadata.CNTDID = pathname.match(recordPattern)[1];
		parseMetadata(doc, url);
		return metadata.itemType;
	}

	return false;
}


function doWeb(doc, url) {
	if (detectWeb(doc, url) == 'multiple') {
		let searchResult = getSearchResults(doc, url);
		Zotero.selectItems(searchResult,
			function (selectedRecords) {
				if (selectedRecords) {
					ZU.processDocuments(Object.keys(selectedRecords), scrape);
				}
			}
		);
	}
	else {
		scrape(doc, url);
	}
}


function getSearchResults(doc, url) {
	let searchResult = {};
	return searchResult;
}


function scrape(doc, url) {
	// ----------------------------- Activate PDF ---------------------------- //
	if (metadata.pdfKey) {
		postUrl = 'http://docs.cntd.ru/pdf/get/';
		postData = 'id=' + metadata.CNTDID + '&key=' + metadata.pdfKey + '&hdaccess=false';
		ZU.doPost(postUrl, postData, scrapeCallback(doc, url));
	}
	else {
		scrapeCallback(doc, url)('', {});
	}
	// ============================= Activate PDF ============================ //
}


function scrapeCallback(doc, url) {
	function callback(responseText, xmlhttp) {
		if (responseText == '{"status":"ready"}') metadata.pdfAvailable = true;

		let extra = [];
		let zItem = new Zotero.Item(metadata.itemType);
		let creator = {fieldMode: 1, firstName: "", lastName: "", creatorType: "author"};
		creator.lastName = metadata.legislativeBody
		zItem.creators.push(creator);
	
		zItem.title = metadata.title;
		zItem.url = url;
		zItem.language = 'Russian';
		zItem.date = metadata.dateAmended ? metadata.dateAmended : metadata.dateEnacted;
	
		switch (metadata.type) {
			case 'code':
				zItem.publicLawNumber = metadata.publicLawNumber;
				zItem.codeNumber = metadata.codeNumber;
				if (metadata.code) zItem.code = metadata.code;
				if (metadata.section) zItem.section = metadata.section;
				break;
			case 'standard':
				zItem.reportType = metadata.codeNumber;
				zItem.reportNumber = metadata.publicLawNumber;
				zItem.title = zItem.title.replace(metadata.codeNumber + ' '
					+ metadata.publicLawNumber + ' ', ''); 
		}
		
		// Extra
		extra.push('CNTDID: ' + metadata.CNTDID);
		if (metadata.published) extra.push('Published: ' + metadata.published);
		extra.push('dateEnactedOriginal: ' + metadata.dateEnacted);
		if (metadata.dateApproved) extra.push('dateApproved: ' + metadata.dateApproved);
		if (metadata.dateRevoked) extra.push('dateRevoked: ' + metadata.dateRevoked);
		zItem.extra = extra.join('\n');
		
		if (metadata.legalStatus != keywords.activeLaw) zItem.tags.push('Inactive');
		if (metadata.dateRevoked) zItem.tags.push('Revoked');

		if (metadata.pdfAvailable) {
			zItem.attachments.push({
				title: "Full Text PDF",
				url: metadata.pdfURL,
				mimeType: "application/pdf"
			});
		}
		
		zItem.complete();
	}
	return callback;
}


/**
 *	Parses record table with document metadata
 *
 *	@return {Object} - extracted metadata.
 */
function parseMetadata(doc, url) {
	let irow;
	let descTableRows = doc.querySelector(filters.metadataTableCSS).rows;

	// Parse description table
	for (irow = 0; irow < descTableRows.length; irow++) {
		let rowCells = descTableRows[irow].cells;
		if (rowCells.length == 0) continue;
		metadata[fieldMap[rowCells[0].innerText
			.trim().slice(0, -1)]] = rowCells[1].innerText.trim();
	}

	// ---------------- Determine subtype and adjust metadata ---------------- //

	// Keyword for codes needs to be extracted from the document type field
	let codeNumber = metadata.codeNumber.match(/^[^\n]+/)[0].trim();
	let docT = documentTypes[codeNumber];
	if (docT) {
		metadata.customType = true;
		metadata.type = docT.type;
		metadata.itemType = docT.itemType;

		if (docT.type == 'code') {
			metadata.codeNumber = metadata.codeNumber.match(/^[^\n]+[\n\t]+([^\n]+)/)[1].trim();
			let codeTitle = metadata.title;
			let icutoff = codeTitle.indexOf(keywords.codeAmendments);
			if (icutoff == -1) icutoff = codeTitle.indexOf(keywords.codeVersion);
			if (icutoff != -1) codeTitle = codeTitle.slice(0, icutoff).trim();
			isplit = codeTitle.indexOf('('); 
			if (isplit != -1) {
				metadata.section = codeTitle.slice(isplit).trim().slice(1, -1).replace(') (', '; ');
				metadata.code = codeTitle.slice(0, isplit).trim();
			}
		}
	}
	else {
		metadata.itemType = 'statute';
	}
	
	// ================ Determine subtype and adjust metadata ================ //

	// Extract pdf key
	let pdfKey = doc.querySelector(filters.pdfKeyScriptCSS);
	if (pdfKey) {
		pdfKey = pdfKey.innerText.match(/^[^']+'([A-Za-z0-9]+)/)[1];
		metadata.pdfKey = pdfKey;
		metadata.pdfURL = 'http://docs.cntd.ru/pdf/get/id/'
			+ metadata.CNTDID + '/key/' + pdfKey + '/file/1';
	}
	
	// Replace separator when multiple publication sources are provided
	if (metadata.published) metadata.published = metadata.published.replace(/[\t\n]+/g, '| ');
	
	// Parse dates with Russian month names
	if (metadata.dateApproved) metadata.dateApproved = parseDate(metadata.dateApproved);
	if (metadata.dateEnacted) metadata.dateEnacted = parseDate(metadata.dateEnacted);
	if (metadata.dateAmended) metadata.dateAmended = parseDate(metadata.dateAmended);
	if (metadata.dateRevoked) metadata.dateRevoked = parseDate(metadata.dateRevoked);
}


/**
 *	Parses date in Russian
 *
 *	@param {String} text - date string DD ruMonth YYYY
 *	@return {String} - date string M/D/Y.
 */
function parseDate(text) {
	const monthsRu = { января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
		июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12 };
	let datePattern = /^\s*([0-9]{1,2})\s+([^\s]+)\s+([0-9]+)/;
	let date = text.match(datePattern);
	date = monthsRu[date[2]] + '/' + date[1] + '/' + date[3];
	return date;
}




/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200128307",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "ГОСТ 1.0-2015 Межгосударственная система стандартизации (МГСС). Основные положения (Переиздание)",
				"creators": [
					{
						"fieldMode": false,
						"firstName": "Росстандарт",
						"lastName": "",
						"creatorType": "author"
					}
				],
				"dateEnacted": "7/01/2016",
				"codeNumber": "ГОСТ",
				"extra": "CNTDID: 1200128307\nPublished: Официальное издание. М.: Стандартинформ, 2019 год\ndateApproved: 12/11/2015",
				"publicLawNumber": "1.0-2015",
				"url": "http://docs.cntd.ru/document/1200128307",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901932011",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "О внесении изменений в Указ Президента Российской Федерации от 16 июля 2004 года N 910 \"О мерах по совершенствованию государственного управления\" (утратил силу с 04.04.2006 на основании Указа Президента РФ от 30.03.2006 N 285)",
				"creators": [
					{
						"fieldMode": false,
						"firstName": "Президент РФ",
						"lastName": "",
						"creatorType": "author"
					}
				],
				"dateEnacted": "4/26/2005",
				"codeNumber": "Указ Президента РФ",
				"extra": "CNTDID: 901932011\nPublished: Собрание законодательства Российской Федерации, N 18, 02.05.2005, ст.1665\ndateApproved: 4/26/2005\ndateRevoked: 4/04/2006",
				"publicLawNumber": "473",
				"url": "http://docs.cntd.ru/document/901932011",
				"attachments": [],
				"tags": [
					{
						"tag": "Inactive"
					},
					{
						"tag": "Revoked"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901931853",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "О награждении государственными наградами Российской Федерации работников государственного унитарного предприятия \"Московский метрополитен\"",
				"creators": [
					{
						"fieldMode": false,
						"firstName": "Президент РФ",
						"lastName": "",
						"creatorType": "author"
					}
				],
				"dateEnacted": "4/25/2005",
				"codeNumber": "Указ Президента РФ",
				"extra": "CNTDID: 901931853\nPublished: Собрание законодательства Российской Федерации, N 18, 02.05.2005\ndateApproved: 4/25/2005",
				"publicLawNumber": "472",
				"url": "http://docs.cntd.ru/document/901931853",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200102193",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "ГОСТ Р 1.0-2012 Стандартизация в Российской Федерации. Основные положения (с Изменением N 1)",
				"creators": [
					{
						"fieldMode": false,
						"firstName": "Росстандарт",
						"lastName": "",
						"creatorType": "author"
					}
				],
				"dateEnacted": "7/01/2013",
				"codeNumber": "ГОСТ Р",
				"extra": "CNTDID: 1200102193\nPublished: официальное издание\t\t\t\t\t\t\t\t\t\t\tМ.: Стандартинформ, 2013 год\ndateApproved: 11/23/2012",
				"publicLawNumber": "1.0-2012",
				"url": "http://docs.cntd.ru/document/1200102193",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901712929",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "О государственном регулировании обеспечения плодородия земель сельскохозяйственного назначения (с изменениями на 5 апреля 2016 года) (редакция, действующая с 1 июля 2016 года)",
				"creators": [
					{
						"fieldMode": false,
						"firstName": "Государственная Дума",
						"lastName": "",
						"creatorType": "author"
					}
				],
				"dateEnacted": "4/05/2016",
				"codeNumber": "Федеральный закон",
				"extra": "CNTDID: 901712929\nPublished: Собрание законодательства Российской Федерации, N 29, 20.07.98, ст.3399\t\t\t\t\t\t\t\t\t\t\tВедомости Федерального Собрания, N 22, 01.08.98\ndateApproved: 7/16/1998",
				"history": "dateEnactedOriginal: undefined",
				"language": "Russian",
				"publicLawNumber": "101-ФЗ",
				"url": "http://docs.cntd.ru/document/901712929",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/901832805",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Гражданский процессуальный кодекс Российской Федерации (с изменениями на 2 декабря 2019 года) (редакция, действующая с 30 марта 2020 года)",
				"creators": [
					{
						"fieldMode": false,
						"firstName": "Государственная Дума",
						"lastName": "",
						"creatorType": "author"
					}
				],
				"dateEnacted": "12/02/2019",
				"codeNumber": "Кодекс РФ\n\nФедеральный закон",
				"extra": "CNTDID: 901832805\nPublished: Российская газета, N 220, 20.11.2002| Парламентская газета, N 220-221, 20.11.2002| Собрание законодательства Российской Федерации, N 46, 18.11.2002, ст.4532| Приложение к \"Российской газете\", N 46, 2002 год| Ведомости Федерального Собрания РФ, N 33, 21.11.2002\ndateApproved: 11/14/2002",
				"history": "dateEnactedOriginal: 2/01/2003",
				"language": "Russian",
				"publicLawNumber": "138-ФЗ",
				"url": "http://docs.cntd.ru/document/901832805",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200003915",
		"items": [
			{
				"itemType": "report",
				"title": "ГОСТ 11371-78 Шайбы. Технические условия (с Изменениями N 1, 2, 3)",
				"creators": [
					{
						"fieldMode": false,
						"firstName": "Госстандарт СССР",
						"lastName": "",
						"creatorType": "author"
					}
				],
				"date": "8/01/2006",
				"extra": "CNTDID: 1200003915\nPublished: официальное издание| Шайбы и контрящие элементы. Технические условия. Конструкция и размеры: Сб. стандартов. - М.: Стандартинформ, 2006 год\ndateEnactedOriginal: 1/01/1979\ndateApproved: 6/26/1978",
				"language": "Russian",
				"libraryCatalog": "a a CNTD.ru",
				"reportNumber": "11371-78",
				"reportType": "ГОСТ",
				"url": "http://docs.cntd.ru/document/1200003915",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/564602190",
		"items": [
			{
				"itemType": "statute",
				"nameOfAct": "Изменение 400/2020 ОКАТО Общероссийский классификатор объектов административно-территориального деления ОК 019-95",
				"creators": [
					{
						"fieldMode": false,
						"firstName": "Росстандарт",
						"lastName": "",
						"creatorType": "author"
					}
				],
				"dateEnacted": "4/01/2020",
				"extra": "CNTDID: 564602190\nPublished: undefined\ndateEnactedOriginal: 4/01/2020\ndateApproved: 3/13/2020",
				"language": "Russian",
				"url": "http://docs.cntd.ru/document/564602190",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/437253093",
		"items": [
			{
				"itemType": "report",
				"title": "Дороги автомобильные общего пользования. Смеси литые асфальтобетонные дорожные горячие и асфальтобетон литой дорожный. Методы испытаний",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Росстандарт",
						"creatorType": "author"
					}
				],
				"date": "6/01/2020",
				"extra": "CNTDID: 437253093\ndateEnactedOriginal: 6/01/2020\ndateApproved: 3/27/2020",
				"language": "Russian",
				"libraryCatalog": "a a CNTD.ru",
				"reportNumber": "54400-2020",
				"reportType": "ГОСТ Р",
				"url": "http://docs.cntd.ru/document/437253093",
				"attachments": [],
				"tags": [
					{
						"tag": "Inactive"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "http://docs.cntd.ru/document/1200170667",
		"items": [
			{
				"itemType": "report",
				"title": "Параметры и критерии оценки качества вождения с целью оценки безопасности использования транспортных средств",
				"creators": [
					{
						"fieldMode": 1,
						"firstName": "",
						"lastName": "Росстандарт",
						"creatorType": "author"
					}
				],
				"date": "6/01/2020",
				"extra": "CNTDID: 1200170667\nPublished: Официальное издание. М.: Стандартинформ, 2020\ndateEnactedOriginal: 6/01/2020\ndateApproved: 12/25/2019",
				"language": "Russian",
				"libraryCatalog": "a a CNTD.ru",
				"reportNumber": "58782-2019",
				"reportType": "ГОСТ Р",
				"url": "http://docs.cntd.ru/document/1200170667",
				"attachments": [],
				"tags": [
					{
						"tag": "Inactive"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/
