function normalizeText(value = "") {
    return String(value || "").trim().toLowerCase();
}

function attributeValue(metadata = {}, names = []) {
    const attributes = Array.isArray(metadata?.attributes) ? metadata.attributes : [];
    const normalizedNames = names.map((name) => normalizeText(name));
    const match = attributes.find((item) => normalizedNames.includes(normalizeText(item?.trait_type)));
    return match?.value;
}

function looksLikeLand(value = "") {
    const text = normalizeText(value);
    if (!text) return false;
    return [
        "land",
        "plot",
        "plots",
        "parcel",
        "acre",
        "acreage",
        "lot",
        "site",
        "farmland",
        "bare land",
        "undeveloped",
    ].some((keyword) => text.includes(keyword));
}

function inferMarketAssetClass(asset = {}) {
    const metadata = asset?.publicMetadata || asset?.metadata || {};
    const explicitCategory = [
        metadata.assetType,
        metadata.asset_type,
        metadata.category,
        metadata.assetClass,
        metadata.asset_class,
        attributeValue(metadata, ["Asset Type", "Asset Class", "Category"]),
    ]
        .map((value) => normalizeText(value))
        .find(Boolean);

    if (looksLikeLand(explicitCategory)) {
        return "land";
    }
    if (explicitCategory === "real_estate" || explicitCategory === "real estate" || explicitCategory === "property") {
        return "real_estate";
    }

    const assetType = Number(asset?.assetType || 0);
    if (assetType === 1) {
        const freeText = [
            metadata.name,
            metadata.title,
            metadata.description,
            metadata.location,
            metadata.properties?.location,
            asset?.publicMetadataURI,
            asset?.metadataURI,
            asset?.tokenURI,
        ]
            .filter(Boolean)
            .join(" ");
        return looksLikeLand(freeText) ? "land" : "real_estate";
    }
    if (assetType === 2) return "vehicle";
    if (assetType === 3) return "commodity";
    return "unknown";
}

function isSupportedProductiveTwin(asset = {}) {
    return Number(asset?.assetType || 0) === 1;
}

function deriveRentalActivity(asset = {}, sessions = []) {
    const linkedSessions = (sessions || []).filter(
        (session) => Number(session?.linkedAssetTokenId || 0) === Number(asset?.tokenId || 0),
    );
    const activeSession = linkedSessions.find(
        (session) => session?.sessionStatus === "active" && session?.isActive !== false,
    ) || null;
    const hasHistory = linkedSessions.length > 0;
    const hasYieldStream = Boolean(asset?.stream?.isActive || Number(asset?.activeStreamId || 0) > 0);
    const rentalReady = Boolean(asset?.rentalReady);

    if (activeSession) {
        return {
            currentlyRented: true,
            activeRevenueStream: hasYieldStream,
            status: "rented",
            label: "Currently Rented",
            reason: "A live rental session is linked to this twin right now.",
            sessionId: Number(activeSession.id || 0),
            sessionStatus: activeSession.sessionStatus || "active",
        };
    }

    if (rentalReady && hasHistory) {
        return {
            currentlyRented: false,
            activeRevenueStream: hasYieldStream,
            status: "idle",
            label: "Rental Idle",
            reason: "This twin has rental history but no live rental session right now.",
            sessionId: 0,
            sessionStatus: "idle",
        };
    }

    if (rentalReady) {
        return {
            currentlyRented: false,
            activeRevenueStream: hasYieldStream,
            status: "ready",
            label: "Ready To Rent",
            reason: "This twin is rental-ready but does not have a live renter right now.",
            sessionId: 0,
            sessionStatus: "ready",
        };
    }

    return {
        currentlyRented: false,
        activeRevenueStream: hasYieldStream,
        status: "not_ready",
        label: "Not Rental Ready",
        reason: asset?.rentalReadiness?.reason || "This twin cannot open a live rental session yet.",
        sessionId: 0,
        sessionStatus: "not_ready",
    };
}

module.exports = {
    deriveRentalActivity,
    inferMarketAssetClass,
    isSupportedProductiveTwin,
};
