import { serve } from "bun";
import { Database } from "bun:sqlite";

const server = serve({
	port: 9567,
	fetch(req){
		return new Response("Bun!");
	},
});

console.log(`Listening on localhost:${server.port}`);




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