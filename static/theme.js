// Follow the OS color scheme. Loaded as an external, render-blocking script in
// <head> because inline scripts are forbidden by CSP `script-src 'self'` (see
// vercel.json and the MV3 extension manifest, where hashes/nonces aren't an
// option). Runs before first paint (no FOUC) and updates live when the OS
// flips light<->dark while the page is open.
(function () {
	try {
		var mq = window.matchMedia('(prefers-color-scheme: dark)');
		var apply = function (dark) {
			document.documentElement.dataset.theme = dark ? 'dark' : 'light';
		};
		apply(mq.matches);
		mq.addEventListener('change', function (e) {
			apply(e.matches);
		});
	} catch (e) {
		/* matchMedia unavailable — leave the light fallback in place */
	}
})();
