// One get-starknet v6 discovery store, shared by the connect modal
// (GetStarknetProvider in main.tsx) and the tip hook, so both see the same
// wallets. Created at module scope so discovery starts listening immediately —
// extensions can register after the page loads.
import { createStore } from "@starknet-io/get-starknet-discovery";

export const walletStore = createStore();
