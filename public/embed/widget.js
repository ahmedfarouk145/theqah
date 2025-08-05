// widget.js
(async function () {
  const container = document.getElementById('theqah-reviews');
  if (!container) return;

  const store = container.dataset.store;
  const productId = container.dataset.productId;
  const color = container.dataset.color || '#00A88F';
  const logo = container.dataset.logo || '';

  if (!store) return;

  const apiUrl = `https://theqah.com.sa/api/get-reviews?storeName=${store}${
    productId ? `&productId=${productId}` : ''
  }`;

  try {
    const res = await fetch(apiUrl);
    const data = await res.json();

    const reviews = data.reviews || [];

    container.innerHTML = `
      <div style="font-family: sans-serif; border:1px solid #eee; padding:16px; border-radius:8px;">
        ${logo ? `<img src="${logo}" alt="logo" style="max-height:40px; margin-bottom:8px;" />` : ''}
        <h3 style="color:${color}; margin-bottom:8px;">آراء العملاء</h3>
        ${reviews.length === 0 ? '<p>لا توجد تقييمات حتى الآن.</p>' : ''}
        <ul style="list-style:none; padding:0; margin:0;">
          ${reviews
            .map(
              (r) => `
            <li style="border-top:1px solid #eee; padding:8px 0;">
              <strong>${r.name || 'عميل'}</strong> ⭐ ${r.stars}/5<br/>
              ${r.comment ? `<p style="margin:4px 0;">${r.comment}</p>` : ''}
            </li>
          `
            )
            .join('')}
        </ul>
      </div>
    `;
  } catch (err) {
    console.error('Error loading reviews:', err);
    container.innerHTML = '<p style="color:red;">حدث خطأ أثناء تحميل التقييمات</p>';
  }
})();
