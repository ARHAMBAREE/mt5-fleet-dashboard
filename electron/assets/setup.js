document.getElementById('setup').addEventListener('submit', async e => {
  e.preventDefault();
  const result = await window.mt5fleet.configure(document.getElementById('url').value);
  document.getElementById('error').textContent = result.error || '';
});
