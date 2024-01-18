import * as fs from "fs";
import { THotspot } from "../types/THotspot";

function main() {
    const hotspotJson: Record<string, THotspot> = JSON.parse(fs.readFileSync("./data/hotspots.json", "utf8"));
    const hotspotKeys: string[] = Object.keys(hotspotJson);
    let csvBuffer = "Key,level,avgPrice,afkFactor,priceVolatility,score\n";

    hotspotKeys.forEach((key: string) => {
        const hotspot = hotspotJson[key];
        csvBuffer += key + ",";
        csvBuffer += hotspot.level + ",";
        csvBuffer += hotspot.avgPrice + ",";
        csvBuffer += hotspot.afkFactor + ",";
        csvBuffer += hotspot.priceVolatility + ",";
        csvBuffer += hotspot.score + "\n";
    });

    fs.writeFileSync("./scripts/hotspots.csv", csvBuffer, "utf8");
}

main();