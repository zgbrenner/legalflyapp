/** Original vector mark: paired veined wings and a segmented abdomen. */
export function FlyMark({ className = "", decorative = true }: { className?: string; decorative?: boolean }) {
  return <svg viewBox="0 0 160 190" className={className} aria-hidden={decorative} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "The Legal Fly"} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M74 82C62 58 23 25 12 43C-1 64 21 108 70 122C79 110 79 95 74 82ZM86 82C98 58 137 25 148 43C161 64 139 108 90 122C81 110 81 95 86 82Z"/>
    <path d="M74 88L17 48M71 101L15 67M70 115L27 91M86 88L143 48M89 101L145 67M90 115L133 91M40 68L38 92M59 78L57 107M120 68L122 92M101 78L103 107" strokeWidth=".7"/>
    <ellipse cx="80" cy="80" rx="10" ry="17"/><path d="M72 95C64 129 69 155 80 164C91 155 96 129 88 95M69 118H91M70 130H90M72 142H88M75 153H85"/>
    <ellipse cx="80" cy="53" rx="12" ry="11"/><ellipse cx="73" cy="51" rx="5" ry="8"/><ellipse cx="87" cy="51" rx="5" ry="8"/>
    <path d="M76 43L70 31M84 43L90 31M70 76L53 72L43 57M90 76L107 72L117 57M71 88L49 103L39 128M89 88L111 103L121 128M74 101L57 130L61 160M86 101L103 130L99 160"/>
  </svg>;
}
