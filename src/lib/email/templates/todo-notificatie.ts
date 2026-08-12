export function todoNotificatieHtml({
  naam,
  taakNaam,
  deadlineLabel,
  link,
}: {
  naam: string;
  taakNaam: string;
  deadlineLabel: string;
  link: string;
}) {
  return `
  <div style="font-family: Poppins, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #042C53;">
    <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 24px;">Nieuwe taak, ${naam}</h1>
    <p>Er staat een nieuwe taak voor je klaar in je dashboard:</p>
    <p style="font-weight: 600; font-size: 18px;">${taakNaam}</p>
    <p>Deadline: ${deadlineLabel}</p>
    <p>
      <a href="${link}" style="display:inline-block; background:#EF9F27; color:#042C53; font-weight:600; padding:12px 24px; border-radius:8px; text-decoration:none;">
        Bekijk in je dashboard
      </a>
    </p>
  </div>
  `;
}
