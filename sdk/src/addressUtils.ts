import { StrKey } from "@stellar/stellar-sdk";

export function normalizeRecipientAddress(address: string) {
    const value = String(address || "").trim();
    if (!value) {
        throw new Error("Recipient address is required");
    }

    if (!StrKey.isValidEd25519PublicKey(value)) {
        throw new Error("Recipient must be a valid Stellar public key");
    }

    return value;
}
