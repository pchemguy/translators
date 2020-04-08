{
	"translatorID": "26ce1cb2-07ec-4d0e-9975-ce2ab35c8343",
	"label": "a a Russian State Library RSL.ru",
	"creator": "PChemGuy",
	"target": "^https?://(search|aleph)\\.rsl\\.ru/",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2020-04-08 21:04:41"
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


/*
  Scaffold issue (date detected: April 2020):
  When detectWeb is run via
    "Ctrl/Cmd-T", "doc" receives "object HTMLDocument";
    "Run test", "doc" receives JS object
*/
function detectWeb(doc, url) {
			Z.debug(doc);
	let subdomain = doc.domain.slice(0, -'.rsl.ru'.length);
	Z.debug(subdomain);
	switch(subdomain) {
		case 'search':
			if (url.indexOf("/search#q=") != -1) {
				return "multiple";
			} else if (url.indexOf("/record/") != -1) {
				return "book";
			} else {
				Z.debug('Catalog section not supported');
				return false;
			}
	    	break;
		case 'aleph':
			if (url.match(/func=(find-[abcm]|basket-short|(history|short)-action)/)) {
				return "multiple";
			} else if (url.indexOf("func=full-set-set") != -1) {
				return "book";
			} else {
				Z.debug('Catalog section not supported');
				return false;
			}
	    	break;
		default:
			Z.debug('Subdomain not supported');
			return false;
	}
}


/*
  TODO: '(detectWeb(doc, url) == "multiple"' section a template/placeholder!
		Search results processing is not yet implemented.
*/
function doWeb(doc, url) {
	if (detectWeb(doc, url) != "multiple") {
		scrape(doc, url);
	} else {
		Zotero.selectItems(getSearchResults(doc, false),
			function (items) {
				if (items) ZU.processDocuments(Object.keys(items), scrape);
			}
		);
	}
}


function scrape(doc, url) {
	// Convert HTML table of MARC record to MARCXML
	let record_marcxml;
	let subdomain = doc.domain.slice(0, -'.rsl.ru'.length);
	switch(subdomain) {
		case 'search':
			record_marcxml = getMARCXML_search_rsl_ru(doc, url);
	    	break;
		case 'aleph':
	    	break;
		default:
			Z.debug('Subdomain not supported');
			return false;
	}
	Z.debug('\n' + record_marcxml);
	
	// call MARCXML translator
	var trans = Zotero.loadTranslator('import');
	trans.setTranslator('edd87d07-9194-42f8-b2ad-997c4c7deefd'); //MARCXML
	trans.setString(record_marcxml);
	trans.setHandler('itemDone', scrape_callback(doc, url));
	trans.translate();
}


// Additional processing after the MARCXML translator
function scrape_callback(doc, url) {
	function callback(obj, item) {
		Zotero.debug("item");
		item.complete();
	}
	return callback;
}


/*
  TODO: This is a template/placeholder!
		Search results processing is not yet implemented.
*/
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


function getMARCXML_search_rsl_ru(doc, url) {
	// var marc_rows = doc.querySelectorAll('div#marc-rec > table > tbody > tr'); 
	// Zotero.debug(text(marc_rows[0], 'td', 1));

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
	
	// Control fields
	for (irow; irow < marc21_table_rows.length; irow++) {
		let cur_cells = marc21_table_rows[irow].cells;
		let field_tag = cur_cells[0].innerText;
		if (Number(field_tag) > 8) { break; }
		let field_val = cur_cells[1].innerText;
		marcxml_lines.push(
			'    <controlfield tag="' + field_tag + '">' + field_val.replace(/#/g, ' ') + '</controlfield>'
		);
	}
	
	// Data fields
	for (irow; irow < marc21_table_rows.length; irow++) {
		let cur_cells = marc21_table_rows[irow].cells;
		let field_tag = cur_cells[0].innerText;

		/*
		  Subfield separator is '$'. Subfield separator always comes right after a tag,
		  so triple all '$' that follow immediately after '>' before stripping HTML tags
		  to prevent collisions with potential occurences of '$' as part of subfield contets. 
		*/
		cur_cells[1].innerHTML = cur_cells[1].innerHTML.replace(/>\$/g, '>$$$$$$');
		field_val = cur_cells[1].innerText;
		let subfields = field_val.split('$$$');
		cur_cells[1].innerHTML = cur_cells[1].innerHTML.replace(/\$\$\$/g, '$$');
		let inds = subfields[0].replace(/#/g, ' ');

		// Data field tag and indicators
		marcxml_lines.push(
			'    <datafield tag="' + field_tag + '" ind1="' + inds[0] + '" ind2="' + inds[1] + '">'
		);
		
		// Subfields
		for (let isubfield = 1; isubfield < subfields.length; isubfield++) {
			// Split on first <space> character to extract the subfield code and its contents
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
/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01002457709",
		"items": [
			{
				"itemType": "book",
				"title": "Study of the ⁴He+²⁰⁹Bi fusion reaction",
				"creators": [
					{
						"firstName": "A. A.",
						"lastName": "Hassan",
						"creatorType": "editor"
					}
				],
				"date": "2003",
				"callNumber": "В383.5,09",
				"language": "eng",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "11",
				"place": "Дубна",
				"publisher": "Объед. ин-т ядер. исслед",
				"series": "Объединенный ин-т ядерных исследований, Дубна",
				"seriesNumber": "E15-2003-186",
				"attachments": [],
				"tags": [
					{
						"tag": "Физико-математические науки -- Физика -- Физика атомного ядра -- Ядерные реакции"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01007721928",
		"items": [
			{
				"itemType": "book",
				"title": "Химия неорганических молекулярных комплексов в газовой фазе: Автореф. дис. на соиск. учен. степени д-ра хим. наук: (02.00.07)",
				"creators": [
					{
						"firstName": "Андрей Владимирович",
						"lastName": "Суворов",
						"creatorType": "author"
					}
				],
				"date": "1977",
				"callNumber": "Г116.625с16",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "32",
				"place": "Ленинград",
				"publisher": "б. и.",
				"shortTitle": "Химия неорганических молекулярных комплексов в газовой фазе",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01009512194",
		"items": [
			{
				"itemType": "book",
				"title": "Химия неорганических молекулярных комплексов в газовой фазе: диссертация ... доктора химических наук: 02.00.01",
				"creators": [
					{
						"firstName": "Андрей Владимирович",
						"lastName": "Суворов",
						"creatorType": "author"
					}
				],
				"date": "1977",
				"callNumber": "Г116.625с16,0",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "308",
				"place": "Ленинград",
				"shortTitle": "Химия неорганических молекулярных комплексов в газовой фазе",
				"attachments": [],
				"tags": [
					{
						"tag": "Неорганическая химия"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01000580022",
		"items": [
			{
				"itemType": "book",
				"title": "Труды Международной конференции \"Математика в индустрии\", 29 июня - 3 июля 1998 года",
				"creators": [],
				"date": "1998",
				"ISBN": "9785879761405",
				"callNumber": "Ж.с11я431(0)",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "352",
				"place": "Таганрог",
				"publisher": "Изд-во Таганрог. гос. пед. ин-та",
				"attachments": [],
				"tags": [
					{
						"tag": "Техника и технические науки -- Применение математических методов -- Материалы конференции"
					}
				],
				"notes": [
					{
						"note": "В надзаг.: М-во общ. и проф. образования РФ. Таганрог. гос. пед. ин-т На обл. в подзаг.: ICIM - 98 Текст рус., англ Посвящается 300-летию основания г. Таганрога"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01004044482",
		"items": [
			{
				"itemType": "book",
				"title": "Химия. Неорганическая химия: учебник для 8 класса общеобразовательных учреждений",
				"creators": [
					{
						"firstName": "Гунтис Екабович",
						"lastName": "Рудзитис",
						"creatorType": "author"
					},
					{
						"firstName": "Фриц Генрихович",
						"lastName": "Фельдман",
						"creatorType": "author"
					}
				],
				"date": "2008",
				"ISBN": "9785090198592",
				"callNumber": "373.167.1:54",
				"edition": "12-е изд., испр",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "175",
				"place": "Москва",
				"publisher": "Просвещение",
				"shortTitle": "Химия. Неорганическая химия",
				"attachments": [],
				"tags": [
					{
						"tag": "Химические науки -- Общая и неорганическая химия -- Учебник для средней общеобразовательной школы"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01008704042",
		"items": [
			{
				"itemType": "book",
				"title": "Комплексообразование серебра (I) с 1,2,4-триазолом и 1,2,4-триазолтиолом: автореферат дис. ... кандидата химических наук: [специальность] 02.00.01 Неорганическая химия",
				"creators": [
					{
						"firstName": "Хайриддин Гуломович",
						"lastName": "Мудинов",
						"creatorType": "author"
					}
				],
				"date": "2019",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "24",
				"place": "Душанбе",
				"shortTitle": "Комплексообразование серебра (I) с 1,2,4-триазолом и 1,2,4-триазолтиолом",
				"attachments": [],
				"tags": [
					{
						"tag": "Неорганическая химия"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01010006646",
		"items": [
			{
				"itemType": "book",
				"title": "Комплексообразование серебра (I) с 1,2,4-триазолом и 1,2,4-триазолтиолом: диссертация ... кандидата химических наук: 02.00.01",
				"creators": [
					{
						"firstName": "Хайриддин Гуломович",
						"lastName": "Мудинов",
						"creatorType": "author"
					}
				],
				"date": "2019",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "135",
				"place": "Душанбе",
				"shortTitle": "Комплексообразование серебра (I) с 1,2,4-триазолом и 1,2,4-триазолтиолом",
				"attachments": [],
				"tags": [
					{
						"tag": "Неорганическая химия"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01008942252",
		"items": [
			{
				"itemType": "book",
				"title": "Товары бытовой химии. Метод определения щелочных компонентов: Goods of household chemistry. Method for determination of alkaline components: государственный стандарт Российской Федерации: издание официальное: утвержден и введен в действие Постановлением Госстандарта России от 29 января 1997 г. № 26: введен впервые: введен 1998-01-01",
				"creators": [],
				"date": "1997",
				"callNumber": "661.185.6.001.4:006.354",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "12",
				"place": "Москва",
				"publisher": "Изд-во стандартов",
				"shortTitle": "Товары бытовой химии. Метод определения щелочных компонентов",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01007057068",
		"items": [
			{
				"itemType": "book",
				"title": "Химия и реставрация",
				"creators": [],
				"date": "1970",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "10",
				"place": "Москва",
				"publisher": "б. и.",
				"series": "Химия/ М-во культуры СССР",
				"seriesNumber": "70",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01000681096",
		"items": [
			{
				"itemType": "book",
				"title": "Тезисы докладов Межрегиональной научной конференции \"Химия на пути в XXI век\", Ухта, 13-14 марта 2000 г",
				"creators": [],
				"date": "2000",
				"ISBN": "9785881792152",
				"callNumber": "Г.я431(2)",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "46",
				"place": "Ухта",
				"publisher": "Ухт. гос. техн. ун-т",
				"attachments": [],
				"tags": [
					{
						"tag": "Химия -- Материалы конференции"
					}
				],
				"notes": [
					{
						"note": "В надзаг.: В надзаг.: М-во образования Рос. Федерации. Ухт. гос. техн. ун-т. Каф. химии"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01002792532",
		"items": [
			{
				"itemType": "bookSection",
				"title": "Физическая химия",
				"creators": [],
				"date": "2005",
				"ISBN": "9785812208066",
				"abstractNote": "Учебное пособие предназначено для студентов, аспирантов, научных и инженерно-технических работников, преподавателей ВУЗов и техникумов",
				"bookTitle": "Физическая и коллоидная химия : учеб",
				"callNumber": "541.1: 664.002.2 (075.8)",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"place": "М.",
				"publisher": "Моск. гос. ун-т печати",
				"attachments": [],
				"tags": [],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01004080147",
		"items": [
			{
				"itemType": "book",
				"title": "Физическая химия: учебное пособие",
				"creators": [
					{
						"firstName": "Константин Григорьевич",
						"lastName": "Боголицын",
						"creatorType": "editor"
					}
				],
				"date": "2008",
				"ISBN": "9785261003861",
				"callNumber": "544(075.8)",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"numPages": "111",
				"place": "Архангельск",
				"publisher": "Архангельский гос. технический ун-т",
				"shortTitle": "Физическая химия",
				"attachments": [],
				"tags": [
					{
						"tag": "Химические науки -- Физическая химия. Химическая физика -- Учебник для высшей школы -- Заочное обучение"
					}
				],
				"notes": [],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/01002386114",
		"items": [
			{
				"itemType": "book",
				"title": "Журнал физической химии",
				"creators": [
					{
						"lastName": "АН СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "РСФСР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "Российская академия наук",
						"creatorType": "editor",
						"fieldMode": true
					}
				],
				"date": "1930",
				"callNumber": "Г5я5",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"place": "Москва",
				"publisher": "Российская академия наук",
				"attachments": [],
				"tags": [
					{
						"tag": "Химические науки -- Физическая химия. Химическая физика -- Общий раздел -- Периодические и продолжающиеся издания"
					}
				],
				"notes": [
					{
						"note": "Основан Бюро физ.-хим. конф. при НТУ ВСНХ СССР в 1930 г Журнал издается под руководством Отделения химии и наук о материалах РАН 1931-1934 (Т. 5 Вып. 1-3) является \"Серией В Химического журнала\" Изд-во: Т. 1 Гос. изд-во; Т. 2 Гос. науч.-техн. изд-во ; Т. 3-5 (Вып. 1-7) Гос. техн.-теорет. изд-во ; Т. 5 (Вып. 8-12) - 11 (Вып. 1-3) ОНТИ НКТП СССР; Т. 11 (Вып. 4-6) - 38 не указано; Т. 39-66 Наука ; Т. 67-72 МАИК \"Наука\"; Т. 73- Наука: МАИК \"Наука\"/Интерпериодика ; Т. 82- Наука Место изд.: 1930, т. 1, 29- М.; 1931. т. 2-28 М.; Л Изд-во: 2017- Федеральное государственное унитарное предприятие Академический научно-издательский, производственно-полиграфический и книгораспространительский центр \"Наука\" ; 2018- Российская академия наук"
					}
				],
				"seeAlso": []
			}
		]
	},
	{
		"type": "web",
		"url": "https://search.rsl.ru/ru/record/07000380351",
		"items": [
			{
				"itemType": "book",
				"title": "Журнал физической химии",
				"creators": [
					{
						"lastName": "АН СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "РСФСР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "СССР",
						"creatorType": "editor",
						"fieldMode": true
					},
					{
						"lastName": "Российская академия наук",
						"creatorType": "editor",
						"fieldMode": true
					}
				],
				"date": "1930",
				"language": "rus",
				"libraryCatalog": "a a Russian State Library RSL.ru",
				"place": "Москва",
				"publisher": "Российская академия наук",
				"attachments": [],
				"tags": [],
				"notes": [
					{
						"note": "Основан Бюро физ.-хим. конф. при НТУ ВСНХ СССР в 1930 г Журнал издается под руководством Отделения химии и наук о материалах РАН 1931-1934 (Т. 5 Вып. 1-3) является \"Серией В Химического журнала\" Изд-во: Т. 1 Гос. изд-во; Т. 2 Гос. науч.-техн. изд-во; Т. 3-5 (Вып. 1-7) Гос. техн.-теорет. изд-во; Т. 5 (Вып. 8-12) - 11 (Вып. 1-3) ОНТИ НКТП СССР; Т. 11 (Вып. 4-6) - 38 не указано; Т. 39-66 Наука; Т. 67-72 МАИК \"Наука\"; Т. 73- Наука: МАИК \"Наука\"/Интерпериодика ; Т. 82- Наука Место изд.: 1930, т. 1, 29- М.; 1931. т. 2-28 М.; Л Изд-во: 2017- Федеральное государственное унитарное предприятие Академический научно-издательский, производственно-полиграфический и книгораспространительский центр \"Наука\" ; 2018- Российская академия наук"
					}
				],
				"seeAlso": []
			}
		]
	}
]
/** END TEST CASES **/
