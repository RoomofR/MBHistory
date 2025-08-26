import { serve } from "bun";
import { Database } from "bun:sqlite";
import { resolveTilde } from "bunmagic";

const ENV = process.env.BUILD;
const PORT = ENV === "PROD" ? 443 : Number(process.env.PORT);

const server_options = {
	port: PORT,
	fetch(req){
		return new Response("Bun!");
	},
}

//ADD TLS if on production
if(ENV === "PROD"){
	console.log(process.env.TLS_KEY_PATH,process.env.TLS_CERT_PATH);

	server_options.tls = {
		key: Bun.file(process.env.TLS_KEY_PATH),
    	cert: Bun.file(process.env.TLS_CERT_PATH),
	}
}

const server = serve(server_options);

console.log(`Listening on localhost:${server.port}`);

//Fetches json from url and parses/returns  ajson object
async function fetchJSON(url){
	try{
		const res = await fetch(url);
		if(!res.ok){
			throw new Error(`Request failed: ${res.status}`);
		}
		const json = await res.json();
		return json;

	}catch (err){
		console.error("Fetch error:", err);
	}
}

async function fetchSalesHistory(itemIDs, options){

}


//console.log( await fetchJSON(`https://universalis.app/api/v2/history/europe/8?entriesToReturn=99999&minSalePrice=0&maxSalePrice=2147483647`))


/*const db = new Database("mydb.sqlite", { create: true });

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