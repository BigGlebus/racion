// Прокси для отчётов FatSecret (Cloudflare Worker).
// Зачем: FatSecret не разрешает сайтам читать отчёт, если браузер шлёт заголовок priority
// (а браузеры шлют его всегда). Здесь отчёт скачивается на сервере Cloudflare, где этого
// запрета нет, и отдаётся приложению «Рацион дня» с разрешением для его сайта.
// Безопасность: пропускает только ссылки на отчёты FatSecret (/export/…) и только запросы
// с сайта приложения; ничего не хранит и не записывает.

const ALLOWED_ORIGINS = ['https://bigglebus.github.io'];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const okOrigin = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const fail = (status, text) => new Response(text, { status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return fail(405, 'Только GET');
    if (!okOrigin) return fail(403, 'Прокси работает только для приложения «Рацион дня»');

    let target;
    try { target = new URL(new URL(request.url).searchParams.get('url') || ''); } catch { return fail(400, 'Нужен параметр url'); }
    const isFatSecret = target.protocol === 'https:' && /(^|\.)fatsecret\.(com|ru)$/.test(target.hostname) && target.pathname.startsWith('/export/');
    if (!isFatSecret) return fail(403, 'Пропускаю только ссылки на отчёты FatSecret');

    let res;
    try {
      res = await fetch(target.toString(), { headers: { 'User-Agent': 'Mozilla/5.0 (racion-proxy)', 'Accept': 'application/pdf,*/*' } });
    } catch {
      return fail(502, 'FatSecret не ответил');
    }
    if (!res.ok) return fail(502, 'FatSecret ответил ' + res.status);
    if (!(res.headers.get('Content-Type') || '').includes('pdf')) return fail(502, 'По ссылке не PDF — возможно, ссылка устарела');

    return new Response(res.body, { headers: { ...cors, 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' } });
  },
};
