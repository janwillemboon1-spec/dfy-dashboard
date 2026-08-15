export function adminNotificatieNieuwInloggegevenHtml({
  klantNaam,
  itemNaam,
  link,
}: {
  klantNaam: string;
  itemNaam: string;
  link: string;
}) {
  return `
  <div style="font-family: Poppins, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #042C53;">
    <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 24px;">Nieuw inloggegeven gedeeld</h1>
    <p><strong>${klantNaam}</strong> heeft een nieuw inloggegeven toegevoegd: <strong>${itemNaam}</strong>.</p>
    <p>
      <a href="${link}" style="display:inline-block; background:#EF9F27; color:#042C53; font-weight:600; padding:12px 24px; border-radius:8px; text-decoration:none;">
        Bekijk in het admin-portaal
      </a>
    </p>
  </div>
  `;
}
