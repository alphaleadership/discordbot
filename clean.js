const fs= require('fs');
const ids = new Set();
fs.readFileSync("./banlist2.txt").toString().split("\n").forEach(line => {
    if(line.length > 0) {
        ids.add(line.split("-")[0].trim());
    }
})
fs.writeFileSync("./banlist2.txt", Array.from(ids).join("\n"));