'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-11 rounded-lg border border-line-strong px-5 font-medium hover:bg-canvas print:hidden"
    >
      Print ticket
    </button>
  );
}
