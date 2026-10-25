import { encodeFunctionData, getAddress } from "viem";
import { erc20Abi } from "./pancake";
/** ERC20 calls target the token contract; the receiver is encoded in transfer(), never inferred from a symbol. */
export function fundingTransfer(
  from: string,
  recipient: string,
  token: string | null,
  amount: bigint,
) {
  const source = getAddress(from),
    destination = getAddress(recipient);
  if (amount <= 0n) throw new Error("Informe um valor maior que zero.");
  if (source.toLowerCase() === destination.toLowerCase())
    throw new Error("Origem e destino são a mesma carteira.");
  if (token && token.toLowerCase() === destination.toLowerCase())
    throw new Error("O destino não pode ser o contrato do token.");
  return token
    ? {
        from: source,
        to: getAddress(token),
        value: "0x0",
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [destination, amount],
        }),
      }
    : {
        from: source,
        to: destination,
        value: `0x${amount.toString(16)}`,
        data: "0x" as `0x${string}`,
      };
}
