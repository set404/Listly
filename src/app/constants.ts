import { SAFE_AREA_TOP } from "./components/ui-kit";

// The status bar/notch inset, trimmed a bit — using it as-is left a
// noticeably taller gap above headers than the design called for.
export const TOP_INSET = `max(0px, calc(${SAFE_AREA_TOP} - 12px))`;
