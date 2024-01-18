
export type THotspot = {
    level: number;
    materials: {
        name: string,
        percentageChance: number,
    }[];

    afkFactor: number;
    avgPrice: number;
    score: number;
    minPrice: number;
    maxPrice: number;
    priceVolatility: number;

    lastUpdated: number;
};