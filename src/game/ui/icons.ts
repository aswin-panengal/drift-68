const paths:Record<string,string>={
  expand:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6',
  pause:'M8 5v14M16 5v14',play:'m8 5 11 7-11 7Z',back:'m14 5-7 7 7 7',restart:'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',
  restore:'M8 8h13v13H8ZM3 16V3h13',sidebar:'M3 4h18v16H3ZM9 4v16',arrow:'M4 12h16m-6-6 6 6-6 6',sound:'M4 9h4l5-4v14l-5-4H4ZM17 8a6 6 0 0 1 0 8',
};
export const icon=(name:string):string=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]?`<path d="${paths[name]}"/>`:''}</svg>`;
export const roadLogo='<svg class="road-logo" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M10 55C47 43 14 34 37 23 53 16 51 9 50 6M23 57C60 43 28 34 49 24 62 16 61 9 60 6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M16 56l6-2m9-6 3-3m-3-8-2-3m4-6 4-2m9-6 4-2m5-7V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
