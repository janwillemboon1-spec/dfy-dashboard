export function adminNotificatieNieuweKlantHtml({
  naam,
  email,
  telefoon,
  link,
}: {
  naam: string;
  email: string;
  telefoon: string | null;
  link: string;
}) {
  return `
  <div style="font-family: Poppins, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #042C53;">
    <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 24px;">Nieuwe zelfregistratie</h1>
    <p>Er heeft zich een nieuwe klant aangemeld via de aanmeldpagina:</p>
    <p style="font-weight: 600; font-size: 16px;">${naam}</p>
    <p>${email}${telefoon ? ` · ${telefoon}` : ''}</p>
    <p>
      <a href="${link}" style="display:inline-block; background:#EF9F27; color:#042C53; font-weight:600; padding:12px 24px; border-radius:8px; text-decoration:none;">
        Bekijk in het admin-portaal
      </a>
    </p>
  </div>
  `;
}
