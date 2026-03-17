import { decodeAddress } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import { u8aToHex } from "@polkadot/util";

function resolveAccountIdHex(addressOrBytes: string | Uint8Array) {
    if (typeof addressOrBytes === "string") {
        if (addressOrBytes.startsWith("0x") && addressOrBytes.length === 66) {
            return addressOrBytes.toLowerCase();
        }
        return u8aToHex(decodeAddress(addressOrBytes)).toLowerCase();
    }

    return u8aToHex(addressOrBytes).toLowerCase();
}

export function accountIdToEvmAddress(addressOrBytes: string | Uint8Array) {
    const accountIdHex = resolveAccountIdHex(addressOrBytes);
    const body = accountIdHex.slice(2);

    if (body.endsWith("ee".repeat(12))) {
        return ethers.getAddress(`0x${body.slice(0, 40)}`);
    }

    const digest = ethers.keccak256(accountIdHex);
    return ethers.getAddress(`0x${digest.slice(-40)}`);
}

export function normalizeRecipientAddress(address: string) {
    const value = String(address || "").trim();
    if (!value) {
        throw new Error("Recipient address is required");
    }

    if (ethers.isAddress(value)) {
        return ethers.getAddress(value);
    }

    try {
        return accountIdToEvmAddress(value);
    } catch {
        throw new Error("Recipient must be a valid EVM or Substrate address");
    }
}
