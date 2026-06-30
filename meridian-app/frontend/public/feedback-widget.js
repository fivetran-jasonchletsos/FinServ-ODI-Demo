(function () {
  'use strict';

  var ENDPOINT = 'https://formsubmit.co/ajax/jason.chletsos@fivetran.com';

  /* ── inject CSS ───────────────────────────────────────────────── */
  var css = [
    '#ftfb-btn{',
      'position:fixed;bottom:28px;right:28px;z-index:9998;',
      'display:flex;align-items:center;gap:8px;',
      'padding:10px 20px;background:#06b6d4;color:#000;border:none;',
      'border-radius:99px;font-size:13px;font-weight:700;',
      "font-family:-apple-system,'Helvetica Neue',sans-serif;",
      'cursor:pointer;letter-spacing:.01em;',
      'box-shadow:0 4px 24px rgba(6,182,212,.45);',
      'transition:transform .15s,box-shadow .15s;',
    '}',
    '#ftfb-btn:hover{transform:translateY(-2px);box-shadow:0 6px 32px rgba(6,182,212,.6);}',

    '#ftfb-panel{',
      'position:fixed;bottom:28px;right:28px;z-index:10000;',
      'width:380px;max-width:calc(100vw - 32px);',
      'background:#0b1929;border:1px solid #1a3050;border-radius:16px;',
      'padding:24px 22px 20px;',
      'box-shadow:0 28px 80px rgba(0,0,0,.7);',
      "font-family:-apple-system,'Helvetica Neue',sans-serif;",
      'display:none;',
    '}',
    '#ftfb-panel.ftfb-open{display:block;animation:ftfb-up .2s ease;}',
    '@keyframes ftfb-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}',

    '.ftfb-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}',
    '.ftfb-title{font-size:14px;font-weight:700;color:#e2f0ff;}',
    '.ftfb-x{background:none;border:none;color:#5c8ab0;cursor:pointer;font-size:20px;line-height:1;padding:0 2px;transition:color .15s;}',
    '.ftfb-x:hover{color:#e2f0ff;}',

    '.ftfb-tag{',
      'display:inline-block;font-size:10px;font-weight:700;',
      'letter-spacing:.1em;text-transform:uppercase;color:#06b6d4;',
      'background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.25);',
      'border-radius:4px;padding:2px 8px;margin-bottom:14px;',
    '}',

    '.ftfb-lbl{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#5c8ab0;margin-bottom:5px;}',

    '.ftfb-stars{display:flex;gap:5px;margin-bottom:14px;}',
    '.ftfb-star{font-size:22px;cursor:pointer;color:#1a3050;transition:color .1s,transform .1s;line-height:1;user-select:none;}',
    '.ftfb-star.on{color:#f59e0b;}',
    '.ftfb-star:hover{transform:scale(1.18);}',

    '.ftfb-ta,.ftfb-inp{',
      'width:100%;background:#06101e;border:1px solid #1a3050;border-radius:8px;',
      'color:#e2f0ff;font-size:13px;font-family:inherit;',
      'padding:9px 12px;outline:none;transition:border-color .15s;',
      'margin-bottom:12px;box-sizing:border-box;',
    '}',
    '.ftfb-ta:focus,.ftfb-inp:focus{border-color:#06b6d4;}',
    '.ftfb-ta::placeholder,.ftfb-inp::placeholder{color:#224060;}',
    '.ftfb-ta{resize:vertical;min-height:78px;}',

    '.ftfb-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',

    '.ftfb-file-zone{',
      'display:flex;align-items:center;gap:10px;',
      'border:1px dashed #1a3050;border-radius:8px;',
      'padding:9px 13px;cursor:pointer;margin-bottom:16px;',
      'transition:border-color .15s;',
    '}',
    '.ftfb-file-zone:hover{border-color:#06b6d4;}',
    '.ftfb-file-zone span{font-size:11px;color:#5c8ab0;word-break:break-all;}',
    '#ftfb-file{display:none;}',

    '.ftfb-submit{',
      'width:100%;padding:11px;background:#06b6d4;color:#000;border:none;',
      'border-radius:8px;font-size:13px;font-weight:700;font-family:inherit;',
      'cursor:pointer;transition:background .15s;',
    '}',
    '.ftfb-submit:hover{background:#22d3ee;}',
    '.ftfb-submit:disabled{opacity:.6;cursor:not-allowed;}',

    '.ftfb-err{font-size:11px;color:#ef4444;text-align:center;margin-top:8px;display:none;}',

    '.ftfb-ok{text-align:center;padding:20px 0 8px;}',
    '.ftfb-ok-icon{font-size:32px;color:#10b981;margin-bottom:10px;}',
    '.ftfb-ok-msg{font-size:14px;font-weight:700;color:#e2f0ff;margin-bottom:6px;}',
    '.ftfb-ok-sub{font-size:12px;color:#5c8ab0;}',
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── helpers ──────────────────────────────────────────────────── */
  function demoName() {
    var t = document.title || '';
    var m = t.match(/^([^——·|]+)/);
    return m ? m[1].trim() : t || 'Demo';
  }

  function svgIcon() {
    return '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1h12v9H8l-3 3V10H1V1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }

  function imgIcon() {
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;opacity:.45" aria-hidden="true"><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="#5c8ab0" stroke-width="1.2"/><circle cx="5.5" cy="7" r="1.5" stroke="#5c8ab0" stroke-width="1.2"/><path d="M1 11l4-3 3 3 2-2 4 4" stroke="#5c8ab0" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  }

  /* ── build DOM ────────────────────────────────────────────────── */
  var btn = document.createElement('button');
  btn.id = 'ftfb-btn';
  btn.setAttribute('aria-label', 'Open feedback form');
  btn.innerHTML = svgIcon() + ' Feedback';
  document.body.appendChild(btn);

  var panel = document.createElement('div');
  panel.id = 'ftfb-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Feedback form');
  panel.innerHTML = [
    '<div class="ftfb-hd">',
      '<span class="ftfb-title">Share your feedback</span>',
      '<button class="ftfb-x" id="ftfb-close" aria-label="Close">&times;</button>',
    '</div>',
    '<div id="ftfb-body">',
      '<span class="ftfb-tag" id="ftfb-demo-tag">' + demoName() + '</span>',
      '<div class="ftfb-lbl">How would you rate this demo?</div>',
      '<div class="ftfb-stars" id="ftfb-stars" role="radiogroup" aria-label="Star rating">',
        '<span class="ftfb-star" data-v="1" role="radio" aria-label="1 star" tabindex="0">&#9733;</span>',
        '<span class="ftfb-star" data-v="2" role="radio" aria-label="2 stars" tabindex="0">&#9733;</span>',
        '<span class="ftfb-star" data-v="3" role="radio" aria-label="3 stars" tabindex="0">&#9733;</span>',
        '<span class="ftfb-star" data-v="4" role="radio" aria-label="4 stars" tabindex="0">&#9733;</span>',
        '<span class="ftfb-star" data-v="5" role="radio" aria-label="5 stars" tabindex="0">&#9733;</span>',
      '</div>',
      '<div class="ftfb-lbl">What did you think?</div>',
      '<textarea class="ftfb-ta" id="ftfb-msg" placeholder="Thoughts, questions, suggestions, or bugs..."></textarea>',
      '<div class="ftfb-row">',
        '<div><div class="ftfb-lbl">Name</div><input class="ftfb-inp" id="ftfb-name" placeholder="Optional" /></div>',
        '<div><div class="ftfb-lbl">Email</div><input class="ftfb-inp" id="ftfb-email" type="email" placeholder="Optional" /></div>',
      '</div>',
      '<div class="ftfb-lbl">Screenshot <span style="font-size:10px;font-weight:400;text-transform:none;letter-spacing:0">(optional, max 5 MB)</span></div>',
      '<label class="ftfb-file-zone" for="ftfb-file">' + imgIcon() + '<span id="ftfb-file-lbl">Attach a screenshot&hellip;</span></label>',
      '<input type="file" id="ftfb-file" accept="image/png,image/jpeg,image/webp,image/gif" />',
      '<button class="ftfb-submit" id="ftfb-send">Send Feedback</button>',
      '<div class="ftfb-err" id="ftfb-err"></div>',
    '</div>',
    '<div class="ftfb-ok" id="ftfb-ok" style="display:none">',
      '<div class="ftfb-ok-icon">&#10003;</div>',
      '<div class="ftfb-ok-msg">Thanks for the feedback!</div>',
      '<div class="ftfb-ok-sub">Jason will take a look shortly.</div>',
    '</div>',
  ].join('');
  document.body.appendChild(panel);

  /* ── star rating ──────────────────────────────────────────────── */
  var rating = 0;
  var stars = panel.querySelectorAll('.ftfb-star');

  function paintStars(n) {
    stars.forEach(function (s) {
      s.classList.toggle('on', parseInt(s.getAttribute('data-v')) <= n);
    });
  }

  stars.forEach(function (s) {
    s.addEventListener('mouseenter', function () { paintStars(parseInt(s.getAttribute('data-v'))); });
    s.addEventListener('mouseleave', function () { paintStars(rating); });
    s.addEventListener('click', function () { rating = parseInt(s.getAttribute('data-v')); paintStars(rating); });
    s.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rating = parseInt(s.getAttribute('data-v')); paintStars(rating); } });
  });

  /* ── file input ───────────────────────────────────────────────── */
  var fileInput = panel.querySelector('#ftfb-file');
  var fileLbl   = panel.querySelector('#ftfb-file-lbl');

  fileInput.addEventListener('change', function () {
    var f = fileInput.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      fileLbl.textContent = 'File too large — max 5 MB';
      fileInput.value = '';
      return;
    }
    fileLbl.textContent = f.name;
  });

  /* ── open / close ─────────────────────────────────────────────── */
  function openPanel() {
    panel.querySelector('#ftfb-demo-tag').textContent = demoName();
    panel.classList.add('ftfb-open');
    btn.style.display = 'none';
    panel.querySelector('#ftfb-msg').focus();
  }

  function closePanel() {
    panel.classList.remove('ftfb-open');
    btn.style.display = '';
    /* reset after transition */
    setTimeout(function () {
      rating = 0;
      paintStars(0);
      panel.querySelector('#ftfb-msg').value   = '';
      panel.querySelector('#ftfb-name').value  = '';
      panel.querySelector('#ftfb-email').value = '';
      fileInput.value = '';
      fileLbl.textContent = 'Attach a screenshot…';
      panel.querySelector('#ftfb-body').style.display = '';
      panel.querySelector('#ftfb-ok').style.display   = 'none';
      panel.querySelector('#ftfb-err').style.display  = 'none';
      var send = panel.querySelector('#ftfb-send');
      send.disabled = false;
      send.textContent = 'Send Feedback';
    }, 250);
  }

  btn.addEventListener('click', openPanel);
  panel.querySelector('#ftfb-close').addEventListener('click', closePanel);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('ftfb-open')) closePanel();
  });

  /* ── submit ───────────────────────────────────────────────────── */
  panel.querySelector('#ftfb-send').addEventListener('click', function () {
    var msg   = panel.querySelector('#ftfb-msg').value.trim();
    var errEl = panel.querySelector('#ftfb-err');

    if (!msg) {
      errEl.textContent = 'Please add a message before sending.';
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';

    var send = panel.querySelector('#ftfb-send');
    send.disabled    = true;
    send.textContent = 'Sending…';

    var form = new FormData();
    form.append('_subject',  'Demo Feedback: ' + demoName() + (rating ? ' — ' + rating + '★' : ''));
    form.append('_captcha',  'false');
    form.append('_template', 'table');
    form.append('demo',      demoName());
    form.append('page_url',  window.location.href);
    form.append('rating',    rating ? rating + ' / 5' : 'Not rated');
    form.append('name',      panel.querySelector('#ftfb-name').value  || 'Anonymous');
    form.append('email',     panel.querySelector('#ftfb-email').value || 'Not provided');
    form.append('message',   msg);

    var file = fileInput.files[0];
    if (file) form.append('screenshot', file, file.name);

    fetch(ENDPOINT, {
      method:  'POST',
      body:    form,
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        panel.querySelector('#ftfb-body').style.display = 'none';
        panel.querySelector('#ftfb-ok').style.display   = 'block';
        setTimeout(closePanel, 3000);
      })
      .catch(function () {
        errEl.textContent    = 'Something went wrong. Please try again.';
        errEl.style.display  = 'block';
        send.disabled        = false;
        send.textContent     = 'Send Feedback';
      });
  });

})();
