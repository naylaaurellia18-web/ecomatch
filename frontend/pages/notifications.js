import { api } from '../core/api.js';
import { icon, esc, pageHead, fmtDate, emptyHtml } from '../core/ui.js';
import { bindForms } from '../core/forms.js';

async function notifView() {
  const rows = await api('/api/notifications');
  const unread = rows.filter((n) => !n.dibaca_pada).length;

  return `${pageHead(
    'Notifikasi',
    unread ? `${unread} notifikasi belum dibaca · pembaruan alokasi, penjemputan, dan status serah terima` : 'Pembaruan alokasi, penjemputan, dan status serah terima',
    `<button class="btn btn-outline btn-sm" data-post="/api/notifications/read-all">${icon('check', 14)} Tandai semua dibaca</button>`
  )}
  <div class="section"><div class="stack stack-3">
    ${
      rows.length === 0
        ? `<div class="card">${emptyHtml('Belum ada notifikasi', 'Notifikasi muncul saat ada alokasi, penjemputan, atau perubahan status.')}</div>`
        : rows
            .map(
              (n) => `<div class="notif ${n.dibaca_pada ? '' : 'unread'}">
          <span class="feed-icon" aria-hidden="true">${icon(n.dibaca_pada ? 'check' : 'bell', 16)}</span>
          <div class="grow">
            <div class="feed-title">${esc(n.judul)}</div>
            <p class="t-sm muted" style="margin:4px 0 8px">${esc(n.pesan)}</p>
            <div class="row row-between">
              <span class="feed-meta">${fmtDate(n.created_at)}</span>
              ${n.dibaca_pada ? '' : `<button class="btn btn-sm btn-ghost" data-post="/api/notifications/${n.id_notifikasi}/read">Tandai dibaca</button>`}
            </div>
          </div>
        </div>`
            )
            .join('')
    }
  </div></div>`;
}

export async function mount(root, ctx) {
  root.innerHTML = await notifView();
  bindForms(root, ctx.rerender);
}
