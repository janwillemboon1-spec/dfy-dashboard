export function welkomstmailHtml({ naam, magicLink }: { naam: string; magicLink: string }) {
  return `
  <div style="font-family: Poppins, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #042C53;">
    <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 24px;">Welkom, ${naam}!</h1>
    <p>Je dashboard bij Boon Vakantieverhuur staat klaar. Hierin zie je straks live hoe je omzet en bezetting zich ontwikkelen.</p>
    <p>
      <a href="${magicLink}" style="display:inline-block; background:#EF9F27; color:#042C53; font-weight:600; padding:12px 24px; border-radius:8px; text-decoration:none;">
        Open je dashboard
      </a>
    </p>
    <p style="font-size: 13px; color: #666;">Deze link is eenmalig en verloopt na gebruik of na een beperkte tijd.</p>
  </div>
  `;
}
