export function validateAddresses (addresses: (string | undefined)[]): boolean {
    if (addresses == undefined)
        return false;
    for (const addr of addresses) {
        if (addr == null || addr == '' || addr.length != 42)
            return false;
    }
    return true;
}