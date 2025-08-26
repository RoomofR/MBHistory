import { serve } from "bun";
import type { Serve } from "bun";
import { Database } from "bun:sqlite";
import { error } from "console";

const whitelist_text = await Bun.file("whitelist.txt").text();
const Whitelisted_Item_Ids: Array<number> = whitelist_text
	.split(/\r?\n/)
	.map(line => line.trim())
	.filter(line => line && !line.startsWith("#"))
	.map(Number);

const ENV = process.env.BUILD;
const PORT = ENV === "PROD" ? 443 : Number(process.env.PORT);

const server_options: Serve = {
	port: PORT,
	fetch(req: any): Response{
		return new Response("Bun!");
	},
	tls: undefined,
}

//ADD TLS if on production
if(ENV === "PROD"){
	server_options.tls = {
		key: Bun.file(process.env.TLS_KEY_PATH!),
    	cert: Bun.file(process.env.TLS_CERT_PATH!),
	}
}

//const server = serve(server_options);
//console.log(`Running as ${ENV} and Listening on localhost:${server.port}`);

//Fetches json from url and parses/returns a json object
async function fetchJSON<T>(url: string): Promise<T>{
	try{
		const res = await fetch(url);
		if(!res.ok){
			throw new Error(`Request failed: ${res.status}`);
		}
		const json = await res.json();
		return json as T;

	}catch (err){
		console.error("Fetch error:", err);
		throw err;
	}
}

type SalesOptions = {
	item_ids: Array<number>,
	server?: string, //europe/light/lich/etc
	entries?: number, //0-99999 default=1800
}

/* type ItemEntry = {
	itemID: number,
	lastUploadTime: number,
	entries: any,
	regionName: string,
	stackSizeHistogram: any,
	stackSizeHistogramNQ: any,
	stackSizeHistogramHQ: any,
	regularSaleVelocity: number,
	nqSaleVelocity: number,
	hqSaleVelocity: string,
}

type SaleHistoryResponce = {
	itemIDs: Array<number>,
	items: Record<string, ItemEntry>
}; */

import {SaleHistoryResponseSchema, type SaleHistoryResponse} from "./schemas/SaleHistoryResponce";

async function fetchSaleHistory({
	item_ids = [],
	server = "europe",
	entries = 1,
}: SalesOptions): Promise<SaleHistoryResponse>{
	if(item_ids.length <= 0)throw error("Empty item ids array!");
	entries = Math.max(Math.min(entries, 99999), 1);
	console.log(`Fetching History:\n- ${item_ids.join(',')}\n- From ${server} with ${entries} entries`);
	const url:string = `https://universalis.app/api/v2/history/${server}/${item_ids.join(",")}?entriesToReturn=${entries}&minSalePrice=0&maxSalePrice=2147483647`;
	const mb_history_data = await fetchJSON(url);
	return SaleHistoryResponseSchema.parse(mb_history_data);
}


const db = new Database("marketboard_data.sqlite", { create: true });

db.exec(`
	CREATE TABLE IF NOT EXISTS last_updated (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		item_id INTEGER UNIQUE NOT NULL,
		timestamp INTEGER UNIQUE NOT NULL
	);
`);

async function checkForUpdatedMBData(){
	const singleHistoryFetch = await fetchSaleHistory({
		item_ids: Whitelisted_Item_Ids,
		entries: 1
	});
	
	//Checks if itemstamp is old for the given item id, then update with new
	const checkAndUpdateLastUploadTime = db.query(`
		INSERT INTO last_updated (item_id, timestamp)
		VALUES (?, ?)
		ON CONFLICT(item_id) DO UPDATE
			SET timestamp = excluded.timestamp
			WHERE excluded.timestamp > last_updated.timestamp
	`);

	for(let item_id of Whitelisted_Item_Ids){
		let item_entry = singleHistoryFetch.items[item_id];
		let lastUploadTime:number = item_entry?.lastUploadTime || 0;

		let db_result = checkAndUpdateLastUploadTime.run(item_id, lastUploadTime);
		let has_update:boolean = db_result.changes > 0;

		console.log(item_id, new Date(lastUploadTime).toISOString(), has_update);
	}
}

await checkForUpdatedMBData();

//console.log( await fetchJSON(`https://universalis.app/api/v2/history/europe/8?entriesToReturn=1&minSalePrice=0&maxSalePrice=2147483647`))
/* fetchSaleHistory({
	item_ids: Whitelisted_Item_Ids,
	entries: 1
}) */

/*

db.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		email TEXT UNIQUE NOT NULL
	);
`);

const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");

insert.run("Alice", "alice@example.com");
insert.run("Bob", "bob@example.com");

const query = db.query("SELECT * FROM users");
const users = query.all();
console.table(users);*/