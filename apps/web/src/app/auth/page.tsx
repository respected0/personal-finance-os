export default function AuthFoundationPage() {
  return (
    <main>
      <h1>Authentication foundation</h1>
      <p>
        Access is invite-only. A valid password and TOTP verification establish
        an AAL2 session through the server boundary.
      </p>
      <dl>
        <dt>Idle timeout</dt>
        <dd>30 minutes</dd>
        <dt>Absolute AAL2 age</dt>
        <dd>12 hours</dd>
        <dt>Sensitive action proof</dt>
        <dd>At most 5 minutes old</dd>
      </dl>
    </main>
  );
}
