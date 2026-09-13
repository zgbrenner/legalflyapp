export function FlyHeadHero({ reducedMotion = false }: { reducedMotion?: boolean }) {
  return <div className={`fly-head-hero${reducedMotion ? ' is-still' : ''}`} aria-hidden="true">
    <div className="fly-head-frame-corner fly-head-frame-corner-tl" />
    <div className="fly-head-frame-corner fly-head-frame-corner-tr" />
    <div className="fly-head-frame-corner fly-head-frame-corner-bl" />
    <div className="fly-head-frame-corner fly-head-frame-corner-br" />
    <svg viewBox="0 0 520 520" fill="none" role="presentation">
      <defs>
        <radialGradient id="flyBrainGlow" cx="50%" cy="45%" r="58%">
          <stop offset="0" stopColor="#e9f5d8" stopOpacity=".98"/>
          <stop offset=".48" stopColor="#a8d8a0" stopOpacity=".84"/>
          <stop offset="1" stopColor="#7f392f" stopOpacity=".18"/>
        </radialGradient>
        <linearGradient id="flyShell" x1="130" y1="90" x2="390" y2="445" gradientUnits="userSpaceOnUse">
          <stop stopColor="#28342e"/>
          <stop offset=".55" stopColor="#121b17"/>
          <stop offset="1" stopColor="#080e0c"/>
        </linearGradient>
        <radialGradient id="flyEye" cx="38%" cy="38%" r="72%">
          <stop offset="0" stopColor="#8d5147"/>
          <stop offset=".55" stopColor="#572a25"/>
          <stop offset="1" stopColor="#1a1210"/>
        </radialGradient>
        <filter id="brainBloom" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="9" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="12" result="blur"/>
          <feOffset dy="11" result="offset"/>
          <feColorMatrix in="offset" values="0 0 0 0 0.01 0 0 0 0 0.03 0 0 0 0 0.02 0 0 0 .6 0"/>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <clipPath id="brainWindow"><path d="M182 171C188 120 219 88 260 88s72 32 78 83c5 48-12 94-29 125-13 23-30 36-49 36s-36-13-49-36c-17-31-34-77-29-125Z"/></clipPath>
      </defs>

      <g className="fly-head-dust" opacity=".55">
        <circle cx="63" cy="171" r="1.5" fill="#cbd9bf"/><circle cx="444" cy="199" r="1" fill="#cbd9bf"/><circle cx="91" cy="352" r="1" fill="#cbd9bf"/><circle cx="413" cy="374" r="1.4" fill="#cbd9bf"/><circle cx="381" cy="87" r="1" fill="#cbd9bf"/><circle cx="137" cy="96" r="1.2" fill="#cbd9bf"/>
      </g>

      <g className="fly-head-antennae" stroke="#8d9e91" strokeWidth="2" strokeLinecap="round">
        <path d="M213 112C182 74 148 51 119 43"/>
        <path d="M307 112C338 74 372 51 401 43"/>
        <path d="M119 43c-12-2-21 1-28 8M401 43c12-2 21 1 28 8" strokeWidth="1.2"/>
      </g>

      <g filter="url(#softShadow)">
        <path d="M260 77C178 77 119 133 113 225c-4 68 19 142 67 199 20 24 48 39 80 39s60-15 80-39c48-57 71-131 67-199-6-92-65-148-147-148Z" fill="url(#flyShell)" stroke="#45584d" strokeWidth="2.2"/>
        <path d="M155 166C115 167 84 205 82 260c-2 54 26 96 69 102 33 4 57-19 61-57 5-44-4-92-20-119-10-16-22-20-37-20Z" fill="url(#flyEye)" stroke="#6d433a" strokeWidth="2"/>
        <path d="M365 166c40 1 71 39 73 94 2 54-26 96-69 102-33 4-57-19-61-57-5-44 4-92 20-119 10-16 22-20 37-20Z" fill="url(#flyEye)" stroke="#6d433a" strokeWidth="2"/>
        <g className="fly-head-eye-grid" stroke="#c78b75" strokeOpacity=".22" strokeWidth="1">
          <path d="M104 214l83 101M94 245l91 82M96 284l77 59M416 214l-83 101M426 245l-91 82M424 284l-77 59"/>
          <path d="M92 230l106 17M88 265l116 16M94 301l104 12M428 230l-106 17M432 265l-116 16M426 301l-104 12"/>
        </g>
        <path d="M214 378c14 26 29 40 46 40s32-14 46-40" stroke="#64766a" strokeWidth="2"/>
        <path d="M235 420c8 17 16 27 25 27s17-10 25-27" fill="#090e0c" stroke="#3e4d45" strokeWidth="1.5"/>
        <path d="M220 373c-21 10-39 25-51 45M300 373c21 10 39 25 51 45" stroke="#44554b" strokeWidth="2" strokeLinecap="round"/>
      </g>

      <g clipPath="url(#brainWindow)">
        <path className="fly-head-cranial-glass" d="M174 166C182 111 216 76 260 76s78 35 86 90c8 53-10 105-29 139-16 28-34 43-57 43s-41-15-57-43c-19-34-37-86-29-139Z" fill="#dbe6d7" fillOpacity=".05" stroke="#9fb4a5" strokeOpacity=".32"/>
        <g className="fly-head-brain" filter="url(#brainBloom)">
          <path d="M259 130c-28-25-64-9-72 26-6 27 5 46 16 57-15 17-13 49 8 61 1 31 20 48 49 48V130Z" fill="url(#flyBrainGlow)"/>
          <path d="M261 130c28-25 64-9 72 26 6 27-5 46-16 57 15 17 13 49-8 61-1 31-20 48-49 48V130Z" fill="url(#flyBrainGlow)"/>
          <g stroke="#557d5d" strokeOpacity=".75" strokeWidth="2" strokeLinecap="round">
            <path d="M245 143c-24 19-23 43-6 58-28 13-28 42-12 58-12 14-9 37 12 50M275 143c24 19 23 43 6 58 28 13 28 42 12 58 12 14 9 37-12 50"/>
            <path d="M218 169c18 0 30 8 37 22M302 169c-18 0-30 8-37 22M211 225c19-2 33 5 44 19M309 225c-19-2-33 5-44 19M221 281c16-4 28 1 34 13M299 281c-16-4-28 1-34 13"/>
          </g>
        </g>
        <g className="fly-head-neural-map" stroke="#d8efc6" strokeWidth="1.15" strokeLinecap="round" opacity=".78">
          <path d="M205 185 235 168 258 197 287 172 317 201 289 236 318 263 281 288 258 258 229 286 203 251 232 222 205 185Z"/>
          <path d="M235 168 232 222M258 197v61M287 172l2 64M229 286l29-28M318 263l-29-27"/>
        </g>
        <g className="fly-head-neural-nodes" fill="#eff8de">
          <circle cx="205" cy="185" r="3"/><circle cx="235" cy="168" r="2.4"/><circle cx="258" cy="197" r="3.1"/><circle cx="287" cy="172" r="2.5"/><circle cx="317" cy="201" r="3"/><circle cx="289" cy="236" r="2.7"/><circle cx="318" cy="263" r="2.4"/><circle cx="281" cy="288" r="3"/><circle cx="258" cy="258" r="3.2"/><circle cx="229" cy="286" r="2.5"/><circle cx="203" cy="251" r="2.8"/><circle cx="232" cy="222" r="2.7"/>
        </g>
        <rect className="fly-head-scan" x="174" y="110" width="172" height="2" fill="#d6efc8" opacity=".42"/>
      </g>

      <path className="fly-head-glass-edge" d="M182 171C188 120 219 88 260 88s72 32 78 83c5 48-12 94-29 125-13 23-30 36-49 36s-36-13-49-36c-17-31-34-77-29-125Z" stroke="#b8c9ba" strokeWidth="1.2" strokeOpacity=".55"/>
      <path d="M171 161c19-50 48-76 89-76s70 26 89 76" stroke="#7e9184" strokeWidth="1" strokeDasharray="4 8" opacity=".4"/>
    </svg>
    <div className="fly-head-caption"><span>SPECIMEN / MEMORY TRACE</span><small>Measured wiring, artificial replay</small></div>
  </div>;
}
