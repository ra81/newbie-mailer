
$ = jQuery = jQuery.noConflict(true);
let $xioDebug = true;
let Realm = getRealm();
let CompanyId = parseCompanyId(document);
let GameDate = parseGameDate(document);

// Константы по которым искать юзверей
let MaxPlayedDays = 30;
let MaxQualFilter = 30;     // управление маркетинг и торговля




// упрощаем себе жисть, подставляем имя скрипта всегда в сообщении
function log(msg: string, ...args: any[]) {
    msg = "newbieMailer: " + msg;
    logDebug(msg, ...args);
}

async function run_async() {
    log("начали");

    let defVal = "Добавить новичков";
    let processVal = "В процессе ..."
    let $addNewbiesBtn = $(`<input type="button" value="${defVal}" class="button160">`);
    $("table.grid input.button160").first().before($addNewbiesBtn);
    $addNewbiesBtn.after("<br>");

    $addNewbiesBtn.on("click.NB", async function (event) {
        let $btn = $(event.target);
        $btn.val(processVal);
        $btn.prop("disabled", true);

        let hasErr = false;
        try {
            
            //debugger;

            // дата реги компании идет в игровом формате, поэтом надо считать в неделях от текущей даты
            let minRegDate = nullCheck(GameDate);
            minRegDate.setDate(minRegDate.getDate() - MaxPlayedDays * 7);

            // загружаем список юзеров и фильтруем по минимальной дате реги, и квалам
            let users = await getUsers_async();
            let goodUsers = await filterUsers_async(users, minRegDate, MaxQualFilter);
            log("нашли новичков:", goodUsers);

            // всех полученных добавляем на форму отправки
            $(`#recipient`).find("option").remove();
            for (let [uid, uname] of goodUsers)
                $(`#recipient`).append(`<option value="${uid}" selected>${uname}</option>`);
        }
        catch (err) {
            hasErr = true;
            throw err;
        }
        finally {
            if (hasErr) 
                $btn.val("ОШИБКА!");
            else
                $btn.val(defVal);

            $btn.prop("disabled", false);
        }
    });

    log("закончили");
}

async function filterUsers_async(users: [Date, number, string][], minRegDate: Date, maxQual: number): Promise<[number, string][]> {

    // оставляем только проходящих по дате зверей
    let arr: [number, string][] = [];
    for (let [date, uid, uname] of users){
        if (date < minRegDate)
        continue;

        arr.push([uid, uname]);
    }

    // для оставшихся надо глянуть квалы и оставить только проходящих по квале
    let goodUIDs: [number, string][] = [];
    for (let [uid, uname] of arr) {
        let url = `/${Realm}/window/user/view/${uid}`;
        let html = await tryGet_async(url);
        let [manage, advert, trade, turn] = parseUser(html, url);

        // оборот должен быть не нулевой
        if (turn > 0 && manage <= maxQual && advert <= maxQual && trade <= maxQual)
            goodUIDs.push([uid, uname]);
    }

    return goodUIDs;
}

async function getUsers_async(): Promise<[Date, number, string][]> {

    // пагинация
    let url = `/${Realm}/main/common/util/setpaging/company/company_search_common/20000`;
    await tryGet_async(url);

    // зверей будем брать со страницы компаний, так как там есть дата реги компании на реалме
    url = `/${Realm}/window/company/list`;
    let html = await tryGet_async(url);
    let users = parseCompanyList(html, url);
    //log("", users);
    return users;
}

function parseCompanyList(html: any, url: string): [Date, number, string][] {
    let $html = $(html);
    try {
        let $rows = $html.find("table.grid tr.even,tr.odd");
        if ($rows.length <= 0)
            throw new Error("Не нашли ни одной компании что невозможно");

        let res: [Date, number, string][] = [];
        $rows.each((i, el) => {
            let $r = $(el);
            let $tds = $r.find("td");

            // айди юзера /olga/window/user/view/564951
            let $a = oneOrError($tds.eq(1), "a");
            let uname = $a.text().trim();

            let m = extractIntPositive($a.attr("href"));
            if (m == null || m.length != 1)
                throw new Error("Не могу получить id пользователя из " + $r.text());

            let uid = m[0];

            // дата реги
            let date = extractDateOrError($tds.eq(2).text());

            res.push([date, uid, uname]);
        });

        return res;
    }
    catch (err) {
        throw err;
    }
}

// manag, ads, trade, turn
function parseUser(html: any, url: string): [number, number, number, number] {
    let $html = $(html);
    try {
        let $box = $html.find("div.assetbox");
        let $r = oneOrError($box, "img[src='/img/qualification/management.png']").closest("tr");
        let management = numberfyOrError($r.children("td").has("b").text().trim());

        $r = oneOrError($box, "img[src='/img/qualification/advert.png']").closest("tr");
        let advert = numberfyOrError($r.children("td").has("b").text().trim());

        $r = oneOrError($box, "img[src='/img/qualification/trade.png']").closest("tr");
        let trade = numberfyOrError($r.children("td").has("b").text().trim());

        // оборот может быть отрицательным если у хрена вообще ничего нет голый акк без компаний
        let txt = $html.find("td:contains('оборот:')").last().next("td").text();
        let turn = numberfy(txt);
        //if (turn < 0)
        //    throw new Error(`У юзера ${url} выручка ${turn} получена из строки ${txt}`);

        return [management, advert, trade, turn];
    }
    catch (err) {
        throw err;
    }
}

$(document).ready(() => run_async());


function logDebug(msg: string, ...args: any[]) {
    if (!$xioDebug)
        return;

    console.log(msg, ...args);
}

function getRealm(): string | null {
    // https://*virtonomic*.*/*/main/globalreport/marketing/by_trade_at_cities/*
    // https://*virtonomic*.*/*/window/globalreport/marketing/by_trade_at_cities/*
    let rx = new RegExp(/https:\/\/virtonomic[A-Za-z]+\.[a-zA-Z]+\/([a-zA-Z]+)\/.+/ig);
    let m = rx.exec(document.location.href);
    if (m == null)
        return null;

    return m[1];
}

function parseCompanyId(html: any): number | null {
    let $html = $(html);

    let href = $html.find("a.dashboard").attr("href");
    if (href == null || href.length <= 0)
        return null;

    let arr = href.match(/\d+/);
    if (arr == null || arr.length !== 1)
        return null;

    return numberfyOrError(arr[0]);
}

function parseGameDate(html: any): Date | null {
    let $html = $(html);

    try {
        // вытащим текущую дату, потому как сохранять данные будем используя ее
        let $date = $html.find("div.date_time");
        if ($date.length !== 1)
            return null;
        //throw new Error("Не получилось получить текущую игровую дату");

        let currentGameDate = extractDate(getOnlyText($date)[0].trim());
        if (currentGameDate == null)
            return null;
        //throw new Error("Не получилось получить текущую игровую дату");

        return currentGameDate;
    }
    catch (err) {
        throw err;
    }
}

function nullCheck<T>(val: T | null | undefined) {

    if (val == null)
        throw new Error(`nullCheck Error`);

    return val;
}

async function tryGet_async(url: string, retries: number = 10, timeout: number = 1000, beforeGet?: IAction1<string>, onError?: IAction1<string>): Promise<any> {
    //logDebug(`tryGet_async: ${url}`);

    // сам метод пришлось делать Promise<any> потому что string | Error не работало какого то хуя не знаю. Из за стрик нулл чек
    let $deffered = $.Deferred<string>();

    if (beforeGet) {
        try {
            beforeGet(url);
        }
        catch (err) {
            logDebug("beforeGet вызвал исключение", err);
        }
    }

    $.ajax({
        url: url,
        type: "GET",

        success: (data, status, jqXHR) => $deffered.resolve(data),

        error: function (this: JQueryAjaxSettings, jqXHR: JQueryXHR, textStatus: string, errorThrown: string) {

            if (onError) {
                try {
                    onError(url);
                }
                catch (err) {
                    logDebug("onError вызвал исключение", err);
                }
            }

            retries--;
            if (retries <= 0) {
                let err = new Error(`can't get ${this.url}\nstatus: ${jqXHR.status}\ntextStatus: ${jqXHR.statusText}\nerror: ${errorThrown}`);
                $deffered.reject(err);
                return;
            }

            //logDebug(`ошибка запроса ${this.url} осталось ${retries} попыток`);
            let _this = this;
            setTimeout(() => {
                if (beforeGet) {
                    try {
                        beforeGet(url);
                    }
                    catch (err) {
                        logDebug("beforeGet вызвал исключение", err);
                    }
                }

                $.ajax(_this);
            }, timeout);
        }
    });

    return $deffered.promise();
}

function oneOrError($item: JQuery, selector: string): JQuery {
    let $one = $item.find(selector);
    if ($one.length != 1)
        throw new Error(`Найдено ${$one.length} элементов вместо 1 для селектора ${selector}`);

    return $one;
}

function extractIntPositive(str: string): number[] | null {
    let m = cleanStr(str).match(/\d+/ig);
    if (m == null)
        return null;

    let n = m.map((val, i, arr) => numberfyOrError(val, -1));
    return n;
}

function cleanStr(str: string): string {
    return str.replace(/[\s\$\%\©]/g, "");
}

function numberfy(str: string): number {
    // возвращает либо число полученно из строки, либо БЕСКОНЕЧНОСТЬ, либо -1 если не получилось преобразовать.

    if (String(str) === 'Не огр.' ||
        String(str) === 'Unlim.' ||
        String(str) === 'Не обм.' ||
        String(str) === 'N’est pas limité' ||
        String(str) === 'No limitado' ||
        String(str) === '无限' ||
        String(str) === 'Nicht beschr.') {
        return Number.POSITIVE_INFINITY;
    } else {
        // если str будет undef null или что то страшное, то String() превратит в строку после чего парсинг даст NaN
        // не будет эксепшнов
        let n = parseFloat(cleanStr(String(str)));
        return isNaN(n) ? -1 : n;
    }
}

function numberfyOrError(str: string, minVal: number = 0, infinity: boolean = false) {
    let n = numberfy(str);
    if (!infinity && (n === Number.POSITIVE_INFINITY || n === Number.NEGATIVE_INFINITY))
        throw new RangeError("Получили бесконечность, что запрещено.");

    if (n <= minVal)
        throw new RangeError("Число должно быть > " + minVal);

    return n;
}

function extractDate(str: string): Date | null {
    let dateRx = /^(\d{1,2})\s+([а-я]+)\s+(\d{1,4})/i;
    let m = dateRx.exec(str);
    if (m == null)
        return null;

    let d = parseInt(m[1]);
    let mon = monthFromStr(m[2]);
    if (mon == null)
        return null;

    let y = parseInt(m[3]);

    return new Date(y, mon, d);
}
function extractDateOrError(str: string): Date {
    let dt = extractDate(str);
    if (dt == null)
        throw new Error(`Не получилось извлечь дату из "${str}"`);

    return dt;
}

function getOnlyText(item: JQuery): string[] {

    // просто children() не отдает текстовые ноды.
    let $childrenNodes = item.contents();
    let res: string[] = [];
    for (let i = 0; i < $childrenNodes.length; i++) {
        let el = $childrenNodes.get(i);
        if (el.nodeType === 3)
            res.push($(el).text());     // так как в разных браузерах текст запрашивается по разному, 
        // универсальный способ запросить через jquery
    }

    return res;
}

interface IAction0 {
    (): void;
}

interface IAction1<T> {
    (arg: T): void;
}

function monthFromStr(str: string) {
    let mnth = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
    for (let i = 0; i < mnth.length; i++) {
        if (str.indexOf(mnth[i]) === 0)
            return i;
    }

    return null;
}