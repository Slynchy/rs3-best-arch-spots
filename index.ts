import * as fs from "fs";
import _fetch, { Headers } from "node-fetch";
import { THotspot } from "./types/THotspot";

const RADIANT_ENERGY_ID = "29322";
const RUBY_NECKLACE_ID = "1660";
const PORTER_ENERGY_REQ = 60;
const PORTER_CHARGES = 25;

// gotta change to 2000 for lucky dark core people
const PORTER_AMOUNT = 500;

let porterCostPerCharge: number = -1;
let porterCostPerCharge_divHeadgear: number = -1;

type THotspotJSON = Record<string, THotspot>;

type TMatJSON = Record<string, {
    readonly id: string;
    price?: number;
    timestamp?: string;
}>;

type TPriceData = Record<string, {
    id: string;
    price: number;
    timestamp: string;
}>;

function inverseExponentialScale(x: number) {
    var b = 0.0115524530093324;
    return 1 - Math.exp(b * (x - 120));
}

function averageArray(arr: Array<number>) {
    var sum = arr.reduce(function(a: number, b: number) {
        return a + b;
    }, 0);

    return sum / arr.length;
}

function logHotspot(_hotspot, _hotspotName) {
    console.log(`
===== ${_hotspotName} =====
  Level:                 ${_hotspot.level}
  
  GP range per gather:   ${_hotspot.minPrice} - ${_hotspot.maxPrice}
  Average GP per gather: ~${Math.round(_hotspot.avgPrice)}
  Avg GP per mat w/ porter: ~${Math.round(_hotspot.avgPrice - porterCostPerCharge_divHeadgear)}
  Price volatility:      ${_hotspot.priceVolatility * 100}%
  
  AFK factor:            ~${Math.round(_hotspot.afkFactor * 100)}%
  Score:                 ${Math.floor(_hotspot.score)}

Materials: [${JSON.stringify(_hotspot.materials, null, "  ")}]\n\n\n`);
}

async function main() {
    // const hotspotsCSV = fs.readFileSync(
    //     "./data/hotspots.csv",
    //     "utf8"
    // );
    const materialsJSON: TMatJSON = JSON.parse(fs.readFileSync(
        "./data/materials.json",
        "utf8"
    ));
    const materialNames = Object.keys(materialsJSON);

    let requestUrl = "https://api.weirdgloop.org/exchange/history/rs/latest?id=";
    materialNames.forEach((k: string, i: number) => {
        const entry = materialsJSON[k];
        const id = entry.id;
        requestUrl += `${id}${i === materialNames.length - 1 ? "" : "%7C"}`;
    });
    requestUrl += `%7C${RADIANT_ENERGY_ID}`; // radiant energy
    requestUrl += `%7C${RUBY_NECKLACE_ID}`; // ruby necklace
    requestUrl += "&lang=en";

    const priceData: Readonly<TPriceData> =
        await _fetch(
            requestUrl,
            {
                headers: new Headers({
                    "User-Agent": "rs3-arch-excavation-pricechecker"
                })
            }
        )
            .then((e) => (
                e.ok ? e.json() : Promise.resolve(null)
            ) as Promise<TPriceData>);
    if(!priceData)
        throw new Error("Failed to retrieve pricedata from api.weirdgloop.org");

    let radiantEnergyPrice = -1;
    let rubyNecklacePrice = -1;
    Object.keys(priceData)
        .forEach((id: string, i: number) => {
            if(id === RADIANT_ENERGY_ID) {
                radiantEnergyPrice = priceData[id].price;
                return;
            } else if(id === RUBY_NECKLACE_ID) {
                rubyNecklacePrice = priceData[id].price;
                return;
            }

            const materialName: string | undefined = materialNames.find(
                (e) => materialsJSON[e].id === id
            );
            if(!materialName) {
                console.warn("Missing mat name for id %s", id);
                return;
            }
            materialsJSON[materialName].price =
                priceData[id].price;
            materialsJSON[materialName].timestamp =
                priceData[id].timestamp;
        });
    porterCostPerCharge = (
        (PORTER_ENERGY_REQ * radiantEnergyPrice) + rubyNecklacePrice
    ) / PORTER_CHARGES;
    porterCostPerCharge_divHeadgear = porterCostPerCharge * 0.9;

    // const hotspotsSplitByLine =
    //     hotspotsCSV.split("\n")
    //         .map((e: string) => {
    //             const splitLine = e.split(",");
    //             return [
    //                 splitLine[0].trim(),
    //                 splitLine[1].trim(),
    //                 (splitLine.slice(2).join(",")).trim()
    //             ];
    //         });

    const hotspots: THotspotJSON = JSON.parse(
        fs.readFileSync("./data/hotspots.json", "utf8")
    );
    const now = Date.now();
    Object.keys(hotspots)
        .forEach((e) => {
            const hotspot = hotspots[e];

            hotspot.afkFactor = 1 - inverseExponentialScale(hotspot.level);
            const prices =
                materialNames
                    .filter((str: string) => {
                        return Boolean(hotspot.materials.find((m) => m.name === str));
                    })
                    .map((e: string) => {
                        return materialsJSON[e].price as number;
                    });
            hotspot.minPrice = Math.min(...prices);
            hotspot.maxPrice = Math.max(...prices);
            // hotspot.avgPrice = averageArray(prices);
            const adjPrices: number[] = [];
            hotspot.materials.forEach((m, i) => {
                adjPrices.push(
                    prices[i] * m.percentageChance
                );
            });
            hotspot.avgPrice = adjPrices.reduce((accumulator, currentValue) => {
                return accumulator + currentValue;
            }, 0);

            hotspot.lastUpdated = now;

            hotspot.priceVolatility =
                (((hotspot.maxPrice - hotspot.minPrice) / hotspot.maxPrice));

            hotspot.score = hotspot.afkFactor * (hotspot.avgPrice - porterCostPerCharge_divHeadgear) * ((1-hotspot.priceVolatility));
        });

    console.log(`
*AFK factor means how long you can AFK there without banking artefacts
**Score is calculated based on the avgPrice vs price volatility vs AFK factor    
`);

    let highestScore = -1;
    let bestHotspotName = "";
    let bestHotspot = null;
    Object.keys(hotspots)
        .forEach((e) => {
            if(hotspots[e].score > highestScore) {
                bestHotspot = hotspots[e];
                highestScore = hotspots[e].score;
                bestHotspotName = e;
            }
        });

    console.log(`The best hotspot at the moment overall is: `);
    logHotspot(bestHotspot, bestHotspotName);

    let highestMoneyScore = -1;
    let mostMoneyHotspotName = "";
    let mostMoneyHotspot = null;
    Object.keys(hotspots)
        .forEach((e) => {
            const val = hotspots[e].avgPrice * ((1-hotspots[e].priceVolatility));
            if(val > highestMoneyScore) {
                mostMoneyHotspot = hotspots[e];
                highestMoneyScore = val;
                mostMoneyHotspotName = e;
            }
        });
    console.log(`The best hotspot at the moment for money is: `);
    logHotspot(mostMoneyHotspot, mostMoneyHotspotName);

    let altHighestMoneyScore = -1;
    let altMostMoneyHotspotName = "";
    let altMostMoneyHotspot = null;
    Object.keys(hotspots)
        .forEach((e) => {
            const val = hotspots[e].avgPrice;
            if(val > altHighestMoneyScore) {
                altMostMoneyHotspot = hotspots[e];
                altHighestMoneyScore = val;
                altMostMoneyHotspotName = e;
            }
        });
    console.log(`An alternative best hotspot at the moment for money is: `);
    logHotspot(altMostMoneyHotspot, altMostMoneyHotspotName);

    fs.writeFileSync(
        "./data/hotspots.json",
        JSON.stringify(hotspots, null, "  "),
        "utf8"
    );
}

main()
    .then((e) => console.log("Complete."))
    .catch((e) => {
        console.error("Closing ")
        console.error(e);
    });