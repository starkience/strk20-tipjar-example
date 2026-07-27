// ModeToggle — PUBLIC vs PRIVATE. PRIVATE is disabled unless the connected
// wallet supports the STRK20 Wallet API (see useTipJar's capability check).
export function ModeToggle(props: {
  mode: "public" | "private";
  onChange: (mode: "public" | "private") => void;
  privateEnabled: boolean;
}) {
  return (
    <div className="mode-toggle" role="group" aria-label="Tip mode">
      <button
        type="button"
        className={`mode-toggle__opt ${props.mode === "public" ? "is-active" : ""}`}
        onClick={() => props.onChange("public")}
      >
        PUBLIC
      </button>
      <button
        type="button"
        className={`mode-toggle__opt mode-toggle__opt--private ${
          props.mode === "private" ? "is-active" : ""
        }`}
        onClick={() => props.onChange("private")}
        disabled={!props.privateEnabled}
        title={props.privateEnabled ? "" : "Needs a privacy wallet (Ready)"}
      >
        🔒 PRIVATE
      </button>
    </div>
  );
}
