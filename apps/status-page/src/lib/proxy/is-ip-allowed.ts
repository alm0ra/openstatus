import { Address4, Address6 } from "ip-address";

function parseAddress(value: string): Address4 | Address6 {
  if (!value.includes(":")) return new Address4(value);
  const address = new Address6(value);
  return address.address4 ?? address;
}

export function isIpAllowed(ip: string, allowedRanges: string[]): boolean {
  if (ip.includes("/")) return false;
  return allowedRanges.some((range) => {
    if (!range.includes("/")) return false;
    try {
      const address = parseAddress(ip);
      const subnet = parseAddress(range);
      if (address instanceof Address4 && subnet instanceof Address4) {
        return address.isInSubnet(subnet);
      }
      if (address instanceof Address6 && subnet instanceof Address6) {
        return address.isInSubnet(subnet);
      }
      return false;
    } catch {
      return false;
    }
  });
}
