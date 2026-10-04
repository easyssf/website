// The Security Event Token generator and inspector of tools.html. Everything runs in the browser:
// the form describes one SET, which is shown as JSON, signed with Web Crypto using a key kept in
// localStorage. "Copy as link" encodes the state of the form into a URL fragment so that a SET
// can be linked to. The event catalog follows CAEP 1.0, RISC 1.0, RFC 9967 and
// SSF 1.0; the aliases are those of org.easyssf.core.event.SsfEventTypes.
(function () {
  'use strict';

  var CAEP = 'https://schemas.openid.net/secevent/caep/event-type/';
  var RISC = 'https://schemas.openid.net/secevent/risc/event-type/';
  var SSF = 'https://schemas.openid.net/secevent/ssf/event-type/';
  var SCIM = 'urn:ietf:params:scim:event:';

  var CREDENTIAL_TYPES = ['password', 'pin', 'x509', 'fido2-platform', 'fido2-roaming', 'fido-u2f',
    'verifiable-credential', 'phone-voice', 'phone-sms', 'app'];

  // A field's default is the example value every event opens with; "Required claims only" clears
  // the optional ones. "when" is a predicate over the values of the event that hides a field and
  // leaves its claim out; "rebuild" re-renders the fields when the value changes, for the fields
  // that depend on it. Field types: text, number, timestamp (seconds, with a "now" button), select, i18n (one string
  // that becomes {"en": ...}), list (comma separated strings), json (a textarea parsed as JSON),
  // bool. "other" on a select allows a free value.
  function f(name, type, opts) {
    var field = { name: name, type: type };
    Object.keys(opts || {}).forEach(function (k) { field[k] = opts[k]; });
    return field;
  }

  // The optional claims of every CAEP event (section 2), with example reasons that fit the event.
  function caepCommon(entity, adminReason, userReason) {
    return [
      f('event_timestamp', 'timestamp', { common: true, hint: 'When the event happened, seconds since 1970-01-01T00:00:00Z.', doc: 'When the event happened, in seconds since 1970-01-01T00:00:00Z. May differ from iat, when the SET was issued.' }),
      f('initiating_entity', 'select', { common: true, options: ['admin', 'user', 'policy', 'system'], default: entity, hint: 'What caused the event.', doc: 'The entity that invoked the event: an administrator, the user, a policy evaluation or the system.' }),
      f('reason_admin', 'i18n', { common: true, label: 'Reason for administrators', default: adminReason, hint: 'Logged and audited, as {"en": ...}.', doc: 'A localizable message for administrators, for logging and auditing: an object of BCP 47 language tags to text.' }),
      f('reason_user', 'i18n', { common: true, label: 'Reason for the user', default: userReason, hint: 'Shown to the end user.', doc: 'A localizable message to show to the end user, language tags to text.' })
    ];
  }
  // Which credential-change claims apply to the credential type chosen.
  function isX509(values) { return values.credential_type === 'x509'; }
  function isFido(values) { return /^fido/.test(values.credential_type || ''); }

  var riscTimestamp = f('event_timestamp', 'timestamp', { common: true, hint: 'When the event happened, seconds since the epoch. Not defined by RISC for this event, but allowed by SSF.' });

  // One entry per profile, with the event types of each version of its specification. The first
  // version is the default; the selector of the generator offers them all, and the listing shows
  // the events of all versions, marking those that are not in every version. SSF comes first, as
  // the framework the profiles build on; the generator opens with CAEP.
  var PROFILES = [
    {
      id: 'ssf', label: 'SSF', subjectFormat: 'stream',
      versions: [{ id: '1.0', spec: 'OpenID SSF 1.0', specUrl: 'https://openid.net/specs/openid-sharedsignals-framework-1_0.html',
        intro: 'Events of the framework itself, about the stream rather than a person: their subject is the stream id as an opaque identifier.',
        events: [
        { uri: SSF + 'verification', title: 'Verification', alias: 'SsfStreamVerification', section: '8.1.4.1',
          description: 'Verifies the stream: the receiver triggered it with a state and checks the state comes back. The subject is the stream id.',
          fields: [f('state', 'text', { default: 'VGhpcyBpcyBhbiBleGFtcGxlIHN0YXRlIHZhbHVlLgo=', hint: 'The value the receiver passed when it triggered the verification.', doc: 'An opaque value the receiver provided when it triggered the verification; it checks that the value comes back.' })] },
        { uri: SSF + 'stream-updated', title: 'Stream Updated', alias: 'SsfStreamUpdated', section: '8.1.5',
          description: 'The transmitter changed the status of the stream. The subject is the stream id.',
          fields: [
            f('status', 'select', { required: true, options: ['enabled', 'paused', 'disabled'], default: 'paused', doc: 'The new status of the stream.' }),
            f('reason', 'text', { default: 'Internal error', doc: 'A short description of why the transmitter updated the status.' })
          ] }
      ] }]
    },

    {
      id: 'caep', label: 'CAEP', versions: [{ id: '1.0', spec: 'OpenID CAEP 1.0', specUrl: 'https://openid.net/specs/openid-caep-1_0.html',
        intro: 'The Continuous Access Evaluation Profile: changes to a subject\'s session, credentials, device or risk, which a relying party acts on while the session is running. Every CAEP event may carry these optional claims (section 2), in addition to its own:',
        events: [
        { uri: CAEP + 'session-revoked', title: 'Session Revoked', alias: 'CaepSessionRevoked', section: '3.1', subjectDefault: 'email',
          description: 'The session identified by the subject has been revoked. easyssf rejects the access tokens of the session and ends the local session.',
          fields: caepCommon('user', 'The user logged out at the identity provider', 'You signed out.') },
        { uri: CAEP + 'token-claims-change', title: 'Token Claims Change', alias: 'CaepTokenClaimsChange', section: '3.2',
          description: 'Claims in the tokens of the subject have changed, the new values are in the event.',
          fields: [f('claims', 'json', { required: true, default: { role: 'ro-admin' }, hint: 'The claims with their new values.', doc: 'One or more claims with their new values.' })].concat(caepCommon('admin', 'Role assignment changed by an administrator', 'Your permissions have changed.')) },
        { uri: CAEP + 'credential-change', title: 'Credential Change', alias: 'CaepCredentialChange', section: '3.3',
          description: 'A credential of the subject was created, revoked, updated or deleted. easyssf ends the matching local sessions of the OIDC client.',
          fields: [
            f('credential_type', 'select', { required: true, options: CREDENTIAL_TYPES, other: true, default: 'password', rebuild: true, doc: 'The type of the credential: one of these, or any other type the transmitter and receiver both support.' }),
            f('change_type', 'select', { required: true, options: ['create', 'revoke', 'update', 'delete'], default: 'update', doc: 'What happened to the credential.' }),
            f('friendly_name', 'text', { placeholder: "Alice's YubiKey", hint: 'The name the user gave the credential.', doc: 'The friendly name of the credential.' }),
            f('x509_issuer', 'text', { label: 'X.509 issuer', default: 'CN=Example Corp CA, O=Example Corp', when: isX509, doc: 'The issuer of the X.509 certificate, RFC 5280.' }),
            f('x509_serial', 'text', { label: 'X.509 serial', default: '3F:2A:11:9C:00:01', when: isX509, doc: 'The serial number of the X.509 certificate.' }),
            f('fido2_aaguid', 'text', { label: 'FIDO2 AAGUID', default: 'ee882879-721c-4913-9775-3dfcce97072a', when: isFido, doc: 'The FIDO2 Authenticator Attestation GUID, WebAuthn.' })
          ].concat(caepCommon('user', 'Password changed by the user', 'You changed your password.')) },
        { uri: CAEP + 'assurance-level-change', title: 'Assurance Level Change', alias: 'CaepAssuranceLevelChange', section: '3.4',
          description: 'The assurance level of the subject changed, for example after a step-up authentication.',
          fields: [
            f('namespace', 'select', { required: true, options: ['RFC8176', 'RFC6711', 'ISO-IEC-29115', 'NIST-IAL', 'NIST-AAL', 'NIST-FAL'], other: true, default: 'NIST-AAL', hint: 'The namespace of the level values, or a custom one agreed with the receiver.', doc: 'The namespace of the values in current_level and previous_level: one of these, or an alias for a namespace the transmitter and receiver agreed on.' }),
            f('current_level', 'text', { required: true, default: 'nist-aal2', doc: 'The current assurance level, as defined in the namespace.' }),
            f('previous_level', 'text', { default: 'nist-aal1', doc: 'The previous assurance level; if absent, the receiver assumes it is unknown to the transmitter.' }),
            f('change_direction', 'select', { options: ['increase', 'decrease'], default: 'increase', hint: 'Should be given when previous_level is.', doc: 'Whether the level increased or decreased; should be given when previous_level is.' })
          ].concat(caepCommon('user', 'Step-up authentication with a security key', 'You signed in with an additional factor.')) },
        { uri: CAEP + 'device-compliance-change', title: 'Device Compliance Change', alias: 'CaepDeviceComplianceChange', section: '3.5',
          description: 'The compliance status of the device identified by the subject changed.',
          fields: [
            f('previous_status', 'select', { required: true, options: ['compliant', 'not-compliant'], default: 'compliant', doc: 'The compliance status before the change.' }),
            f('current_status', 'select', { required: true, options: ['compliant', 'not-compliant'], default: 'not-compliant', doc: 'The compliance status that triggered the event.' })
          ].concat(caepCommon('policy', 'Device out of compliance: disk encryption disabled', 'Your device no longer meets the security policy.')) },
        { uri: CAEP + 'session-established', title: 'Session Established', alias: 'CaepSessionEstablished', section: '3.6',
          description: 'A session was established for the subject, with optional properties of the session.',
          fields: [
            f('fp_ua', 'text', { label: 'User agent fingerprint fp_ua', default: 'abb0b6e7da81a42233f8f2b1a8ddb1b9a4c81611', doc: 'A fingerprint of the user agent computed by the transmitter; describes the session, does not identify it.' }),
            f('acr', 'text', { label: 'acr', default: 'urn:mace:incommon:iap:silver', doc: 'The authentication context class reference of the session, as in an OpenID Connect ID Token.' }),
            f('amr', 'list', { label: 'amr', default: 'pwd, otp', hint: 'Authentication method references, comma separated.', doc: 'The authentication methods references of the session, an array of strings as in an ID Token.' }),
            f('ext_id', 'text', { label: 'External session id ext_id', default: '_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6', doc: 'An external session identifier, to correlate the session with a broader one, a SAML session say.' })
          ].concat(caepCommon('user', 'The user signed in interactively', 'You signed in.')) },
        { uri: CAEP + 'session-presented', title: 'Session Presented', alias: 'CaepSessionPresented', section: '3.7',
          description: 'The session was presented to the transmitter again, for example the user came back.',
          fields: [
            f('fp_ua', 'text', { label: 'User agent fingerprint fp_ua', default: 'abb0b6e7da81a42233f8f2b1a8ddb1b9a4c81611', doc: 'A fingerprint of the user agent computed by the transmitter.' }),
            f('ext_id', 'text', { label: 'External session id ext_id', default: '_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6', doc: 'An external session identifier, to correlate the session with a broader one.' })
          ].concat(caepCommon('user', 'Session presented to another application', 'Your session was used to sign in to another application.')) },
        { uri: CAEP + 'risk-level-change', title: 'Risk Level Change', alias: 'CaepRiskLevelChange', section: '3.8',
          description: 'The risk level the transmitter sees for the principal changed.',
          fields: [
            f('principal', 'select', { required: true, options: ['USER', 'DEVICE', 'SESSION', 'TENANT', 'ORG_UNIT', 'GROUP'], other: true, default: 'USER', doc: 'The principal entity the observed risk concerns, or another entity as defined by SSF.' }),
            f('current_level', 'select', { required: true, options: ['LOW', 'MEDIUM', 'HIGH'], default: 'HIGH', doc: 'The current risk level of the subject.' }),
            f('previous_level', 'select', { options: ['LOW', 'MEDIUM', 'HIGH'], default: 'LOW', doc: 'The previously known risk level; if absent, the receiver assumes it is unknown to the transmitter.' }),
            f('risk_reason', 'text', { default: 'Impossible travel', hint: 'Recommended.', doc: 'What contributed to the change of the risk level. Recommended.' })
          ].concat(caepCommon('system', 'Impossible travel detected', 'We noticed sign-ins from distant locations.')) }
      ] }]
    },

    {
      id: 'risc', label: 'RISC', versions: [{ id: '1.0', spec: 'OpenID RISC Profile 1.0', specUrl: 'https://openid.net/specs/openid-risc-1_0.html',
        intro: 'Risk Incident Sharing and Coordination: changes to a subject\'s account, exchanged between the providers that hold accounts of the same person. RISC defines no common claims; each event has its own, most have none. SSF allows event_timestamp in any event, so the generator offers it:',
        events: [
        { uri: RISC + 'account-credential-change-required', title: 'Account Credential Change Required', alias: 'RiscAccountCredentialChangeRequired', section: '2.1',
          description: 'The account was required to change a credential, a password change say.', fields: [riscTimestamp] },
        { uri: RISC + 'account-purged', title: 'Account Purged', alias: 'RiscAccountPurged', section: '2.2',
          description: 'The account has been permanently deleted.', fields: [riscTimestamp] },
        { uri: RISC + 'account-disabled', title: 'Account Disabled', alias: 'RiscAccountDisabled', section: '2.3',
          description: 'The account has been disabled; it may be enabled again later.',
          fields: [f('reason', 'select', { options: ['hijacking', 'bulk-account'], default: 'hijacking', doc: 'Why the account was disabled.' }), riscTimestamp] },
        { uri: RISC + 'account-enabled', title: 'Account Enabled', alias: 'RiscAccountEnabled', section: '2.4',
          description: 'The account has been enabled.', fields: [riscTimestamp] },
        { uri: RISC + 'identifier-changed', title: 'Identifier Changed', alias: 'RiscIdentifierChanged', section: '2.5',
          description: 'The email or phone number in the subject changed; the subject holds the old value. Issued by the provider authoritative for the identifier.',
          fields: [f('new-value', 'text', { label: 'New value', default: 'alice.roe@example.com', doc: 'The new value of the identifier; the subject holds the old one.' }), riscTimestamp],
          subjectFormats: ['email', 'phone_number'] },
        { uri: RISC + 'identifier-recycled', title: 'Identifier Recycled', alias: 'RiscIdentifierRecycled', section: '2.6',
          description: 'The email or phone number in the subject now belongs to a new user.', fields: [riscTimestamp],
          subjectFormats: ['email', 'phone_number'] },
        { uri: RISC + 'credential-compromise', title: 'Credential Compromise', alias: 'RiscCredentialCompromise', section: '2.7',
          description: 'A credential of the subject was found to be compromised.',
          fields: [
            f('credential_type', 'select', { required: true, options: CREDENTIAL_TYPES, other: true, default: 'password', doc: 'The type of the compromised credential, one of the values of the CAEP Credential Change event.' }),
            f('event_timestamp', 'timestamp', { hint: 'When the transmitter discovered the compromise.', doc: 'When the transmitter discovered the compromise, in seconds since the epoch.' }),
            f('reason_admin', 'i18n', { label: 'Reason for administrators', default: 'Credential found in a leaked data set', doc: 'Why the event was generated, for administrators.' }),
            f('reason_user', 'i18n', { label: 'Reason for the user', default: 'Your password appeared in a data breach, please change it.', doc: 'Why the event was generated, for the end user.' })
          ] },
        { uri: RISC + 'opt-in', title: 'Opt In', alias: 'RiscOptIn', section: '2.8.1',
          description: 'The account opted into the RISC event exchange.', fields: [riscTimestamp] },
        { uri: RISC + 'opt-out-initiated', title: 'Opt Out Initiated', alias: 'RiscOptOutInitiated', section: '2.8.2',
          description: 'The user asked to opt out; events are still exchanged for a while.', fields: [riscTimestamp] },
        { uri: RISC + 'opt-out-cancelled', title: 'Opt Out Cancelled', alias: 'RiscOptOutCancelled', section: '2.8.3',
          description: 'The opt-out was cancelled, the account is opted in again.', fields: [riscTimestamp] },
        { uri: RISC + 'opt-out-effective', title: 'Opt Out Effective', alias: 'RiscOptOutEffective', section: '2.8.4',
          description: 'The account is opted out, no more RISC events for it.', fields: [riscTimestamp] },
        { uri: RISC + 'recovery-activated', title: 'Recovery Activated', alias: 'RiscRecoveryActivated', section: '2.9',
          description: 'The account went through a recovery flow.', fields: [riscTimestamp] },
        { uri: RISC + 'recovery-information-changed', title: 'Recovery Information Changed', alias: 'RiscRecoveryInformationChanged', section: '2.10',
          description: 'Recovery information of the account changed, a recovery email address say.', fields: [riscTimestamp] }
      ] }]
    },

    {
      id: 'scim', label: 'SCIM', subjectFormat: 'scim',
      versions: [{ id: 'rfc9967', spec: 'RFC 9967, SCIM Events', specUrl: 'https://www.rfc-editor.org/rfc/rfc9967',
        intro: 'SCIM Events: provisioning changes of a resource at a SCIM service provider, for replication and coordinated provisioning. The subject of the SET is the resource as a scim identifier, the txn claim of the SET groups the events of one transaction. The provisioning events come in a full form that carries the resource as data and a notice form that only names the attributes that changed. A common payload attribute:',
        events: [
        { uri: SCIM + 'feed:add', title: 'Feed Add', alias: 'ScimFeedAdd', section: '2.3.1',
          description: 'The resource joined the event feed. It is not necessarily new.', fields: [] },
        { uri: SCIM + 'feed:remove', title: 'Feed Remove', alias: 'ScimFeedRemove', section: '2.3.2',
          description: 'The resource left the event feed. It was not necessarily deleted.', fields: [] },
        { uri: SCIM + 'prov:create:full', title: 'Create (full)', alias: 'ScimProvCreateFull', section: '2.4.1',
          description: 'A resource was created; the event carries its final representation.',
          fields: [scimData(userResource()), scimVersion()] },
        { uri: SCIM + 'prov:create:notice', title: 'Create (notice)', alias: 'ScimProvCreateNotice', section: '2.4.1',
          description: 'A resource was created; the event names the attributes set. The receiver may GET the resource.',
          fields: [scimAttributes('id, userName, name, emails'), scimVersion()] },
        { uri: SCIM + 'prov:patch:full', title: 'Patch (full)', alias: 'ScimProvPatchFull', section: '2.4.2',
          description: 'The resource was modified with SCIM PATCH; the event carries the PatchOp.',
          fields: [scimData({
            schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
            Operations: [{ op: 'replace', path: 'active', value: false }]
          }), scimVersion()] },
        { uri: SCIM + 'prov:patch:notice', title: 'Patch (notice)', alias: 'ScimProvPatchNotice', section: '2.4.2',
          description: 'The resource was modified with SCIM PATCH; the event names the attributes.',
          fields: [scimAttributes('active'), scimVersion()] },
        { uri: SCIM + 'prov:put:full', title: 'Put (full)', alias: 'ScimProvPutFull', section: '2.4.3',
          description: 'The resource was replaced with SCIM PUT; the event carries the request body.',
          fields: [scimData(userResource()), scimVersion()] },
        { uri: SCIM + 'prov:put:notice', title: 'Put (notice)', alias: 'ScimProvPutNotice', section: '2.4.3',
          description: 'The resource was replaced with SCIM PUT; the event names the attributes that changed.',
          fields: [scimAttributes('emails, name.familyName'), scimVersion()] },
        { uri: SCIM + 'prov:delete', title: 'Delete', alias: 'ScimProvDelete', section: '2.4.4',
          description: 'The resource was deleted and thereby removed from the feed. No payload.', fields: [] },
        { uri: SCIM + 'prov:activate', title: 'Activate', alias: 'ScimProvActivate', section: '2.4.5',
          description: 'The resource was activated, the account may be logged in to.', fields: [] },
        { uri: SCIM + 'prov:deactivate', title: 'Deactivate', alias: 'ScimProvDeactivate', section: '2.4.6',
          description: 'The resource was deactivated, typically its user may no longer have an active session.', fields: [] },
        { uri: SCIM + 'misc:asyncresp', title: 'Asynchronous Response', alias: 'ScimMiscAsyncResponse', section: '2.5.1.3',
          description: 'An asynchronous SCIM request completed; txn is the value the client got for it. Like one SCIM bulk response operation.',
          fields: [
            f('method', 'select', { required: true, options: ['POST', 'PUT', 'PATCH', 'DELETE'], default: 'PUT', doc: 'The HTTP method of the request that completed.' }),
            f('status', 'text', { required: true, default: '200', hint: 'The HTTP status, as a string.', doc: 'The HTTP status of the request, as a string like in a SCIM bulk response.' }),
            f('version', 'text', { label: 'ETag version', default: 'W/"huJj29dMNgu3WXPD"', doc: 'The ETag version of the resource after the request.' }),
            f('bulkId', 'text', { hint: 'Of a bulk request operation.', doc: 'The bulkId of the operation, for a request from a SCIM bulk request.' }),
            f('response', 'json', { hint: 'For a failed request: the SCIM error with schemas, scimType, detail and status.', doc: 'For a failed request, required then: the SCIM error response with scimType, detail and status.' })
          ] }
      ] }]
    }
  ];

  function scimData(value) { return f('data', 'json', { required: true, default: value, hint: 'The resource, or the operation applied.', doc: 'The final representation of the resource, or for a patch the PatchOp applied; like the data attribute of a SCIM bulk operation.' }); }
  function scimAttributes(value) { return f('attributes', 'list', { required: true, default: value, hint: 'Paths of the attributes, comma separated.', doc: 'The paths of the attributes added, revised or removed; the receiver may GET the resource for their values.' }); }
  function scimVersion() { return f('version', 'text', { label: 'ETag version', default: 'W/"a330bc54f0671c9"', common: true, hint: 'Of the resource after the event.', doc: 'The ETag version of the resource as a result of the event.' }); }
  function userResource() {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: '2b2f880af6674ac284bae9381673d462',
      externalId: 'alice',
      userName: 'alice@example.com',
      name: { givenName: 'Alice', familyName: 'Example' },
      emails: [{ type: 'work', value: 'alice@example.com', primary: true }],
      active: true
    };
  }

  // Subject identifier formats: RFC 9493, the SCIM one of RFC 9967, and the additional ones of
  // SSF 1.0 section 3.5. "stream" is opaque with a stream id, for the SSF events.
  var FORMATS = {
    email: { label: 'email', fields: [f('email', 'text', { required: true, default: 'alice@example.com' })] },
    iss_sub: { label: 'iss_sub, issuer and subject', fields: [
      f('iss', 'text', { required: true, default: 'https://idp.example/realms/demo' }),
      f('sub', 'text', { required: true, default: '99beb27c-c1c2-4955-882a-e0dc4996fcbc' })] },
    opaque: { label: 'opaque', fields: [f('id', 'text', { required: true, default: 'dMTlD|1600802906337.16|16008.16' })] },
    account: { label: 'account, an acct: URI', fields: [f('uri', 'text', { required: true, default: 'acct:alice@example.com' })] },
    phone_number: { label: 'phone_number', fields: [f('phone_number', 'text', { required: true, default: '+12065550100' })] },
    did: { label: 'did, a decentralized identifier', fields: [f('url', 'text', { required: true, default: 'did:example:123456' })] },
    uri: { label: 'uri', fields: [f('uri', 'text', { required: true, default: 'https://example.com/users/alice' })] },
    jwt_id: { label: 'jwt_id, a JWT (SSF)', fields: [
      f('iss', 'text', { required: true, default: 'https://idp.example/realms/demo' }),
      f('jti', 'text', { required: true, default: 'B70BA622-9515-4353-A866-823539EECBC8' })] },
    saml_assertion_id: { label: 'saml_assertion_id (SSF)', fields: [
      f('issuer', 'text', { required: true, default: 'https://idp.example/realms/demo' }),
      f('assertion_id', 'text', { required: true, default: '_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6' })] },
    'ip-addresses': { label: 'ip-addresses (SSF)', fields: [f('ip-addresses', 'list', { required: true, default: '10.29.37.75, 2001:db8::8a2e:370:7334', hint: 'Comma separated.' })] },
    scim: { label: 'scim, a SCIM resource (RFC 9967)', fields: [
      f('uri', 'text', { required: true, default: '/Users/2b2f880af6674ac284bae9381673d462', hint: 'The relative path of the resource at the service provider.' }),
      f('externalId', 'text', { default: 'alice', hint: 'How the receiver knows the resource, if known.' }),
      f('id', 'text', { hint: 'The SCIM id, for backwards compatibility.' }),
      f('userName', 'text', { hint: 'Or another attribute unique at the service provider.' })] },
    stream: { label: 'opaque, the stream id', format: 'opaque', fields: [f('id', 'text', { required: true, default: 'f67e39a0a4d34d56b3aa1bc4cff0069f', label: 'Stream id' })] },
    complex: { label: 'complex, several members', members: ['user', 'session', 'device', 'application', 'tenant', 'org_unit', 'group'] }
  };
  var SIMPLE_FORMATS = Object.keys(FORMATS).filter(function (k) { return k !== 'complex' && k !== 'stream'; });
  var MEMBER_DEFAULTS = {
    user: { on: true, format: 'iss_sub' },
    session: { on: true, format: 'opaque' },
    device: { on: false, format: 'opaque', opaque: { id: 'device-7f3a' } },
    application: { on: false, format: 'uri', uri: { uri: 'https://my-app.example' } },
    tenant: { on: false, format: 'opaque', opaque: { id: '123456789' } },
    org_unit: { on: false, format: 'opaque', opaque: { id: 'ou-sales' } },
    group: { on: false, format: 'opaque', opaque: { id: 'group-admins' } }
  };

  // ---- state ----------------------------------------------------------------------------------

  var state;
  var form = document.getElementById('gen');

  function now() { return Math.floor(Date.now() / 1000); }
  function uuid() {
    if (crypto.randomUUID) { return crypto.randomUUID(); }
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function hex(n) { return Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(n)), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }

  function defaultState() {
    var s = {
      profile: 'caep',
      event: CAEP + 'session-revoked',
      token: { iss: 'https://idp.example/realms/demo', aud: 'https://my-app.example', jti: uuid(), iat: now(), txn: hex(16), alg: 'RS256', legacySubject: false },
      subject: { format: 'complex', autoFormat: 'complex', userFormat: 'complex', members: {} },
      versions: {},
      events: {}
    };
    var first = versionOf(profileOf(s.profile)).events[0];
    if (first.subjectDefault) { s.subject.format = s.subject.autoFormat = first.subjectDefault; }
    return s;
  }

  function profileOf(id) { return PROFILES.filter(function (p) { return p.id === id; })[0] || PROFILES[0]; }
  // The selected version of a profile's specification, the first one by default.
  function versionOf(profile) {
    var id = ((state && state.versions) || {})[profile.id];
    return profile.versions.filter(function (v) { return v.id === id; })[0] || profile.versions[0];
  }
  function eventIn(version, uri) { return version.events.filter(function (e) { return e.uri === uri; })[0] || null; }
  function currentEvent() {
    var version = versionOf(profileOf(state.profile));
    var ev = eventIn(version, state.event);
    if (!ev) {
      ev = version.events[0];
      state.event = ev.uri;
    }
    return ev;
  }

  // A path like "token.iss", "subject.members.user.iss_sub.sub" or "ev.credential_type" (the
  // fields of the current event) names a value in the state.
  function resolve(path) {
    var parts = path.split('.');
    var obj = state;
    if (parts[0] === 'ev') {
      obj = state.events[state.event] || (state.events[state.event] = {});
      parts.shift();
    }
    for (var i = 0; i < parts.length - 1; i++) {
      if (typeof obj[parts[i]] !== 'object' || obj[parts[i]] === null) { obj[parts[i]] = {}; }
      obj = obj[parts[i]];
    }
    return { obj: obj, key: parts[parts.length - 1] };
  }
  function get(path) { var r = resolve(path); return r.obj[r.key]; }
  function set(path, value) { var r = resolve(path); r.obj[r.key] = value; }

  // ---- form building --------------------------------------------------------------------------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'text') { node.textContent = v; }
      else if (k === 'class') { node.className = v; }
      else if (k === 'checked' || k === 'selected' || k === 'hidden' || k === 'disabled') { node[k] = !!v; }
      else if (v !== undefined && v !== null && v !== false) { node.setAttribute(k, v === true ? '' : v); }
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) { return; }
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  var fieldSeq = 0;
  function fieldLabel(field) {
    return field.label || field.name;
  }
  // Builds the input of a field at the given state path, applying the field's default to the
  // state when it has no value yet.
  function buildField(field, path) {
    var id = 'f' + (++fieldSeq);
    var value = get(path);
    if (value === undefined && field.default !== undefined) {
      value = field.type === 'json' ? JSON.stringify(field.default, null, 2) : field.default;
      set(path, value);
    }
    if (value === undefined && field.type === 'timestamp') { value = now(); set(path, value); }
    var wrap = el('div', { class: 'field' + (field.type === 'bool' ? ' check' : ''), 'data-field': path });
    var label = el('label', { for: id }, [fieldLabel(field), field.required ? el('span', { class: 'req', title: 'required', text: '*' }) : null]);
    var input;
    switch (field.type) {
      case 'select':
        var otherOn = field.other && !!get(path + ':other');
        input = el('select', { id: id, 'data-path': field.other ? undefined : path, 'data-rebuild': field.rebuild && !field.other ? '' : undefined });
        if (!field.required) { input.appendChild(el('option', { value: '', text: '' })); }
        field.options.forEach(function (o) { input.appendChild(el('option', { value: o, text: o })); });
        if (field.other) { input.appendChild(el('option', { value: '\u0000other', text: 'other value\u2026' })); }
        if (otherOn) {
          input.value = '\u0000other';
        } else {
          var known = value !== undefined && (value === '' ? !field.required : field.options.indexOf(value) >= 0);
          input.value = known ? value : (field.required ? field.options[0] : '');
          if (!known) { set(path, input.value); }
        }
        if (field.other) {
          // The select is not bound to the state itself: "other" switches to a text input.
          input.addEventListener('change', function () {
            var other = input.value === '\u0000other';
            set(path + ':other', other);
            set(path, other ? '' : input.value);
            rebuild();
          });
          if (otherOn) {
            var text = el('input', { type: 'text', id: id + 'o', 'data-path': path, placeholder: 'custom value', class: 'mono' });
            text.value = value === undefined ? '' : value;
            wrap.appendChild(label);
            wrap.appendChild(el('div', { class: 'with-btn' }, [input, text]));
            if (field.hint) { wrap.appendChild(el('span', { class: 'hint', text: field.hint })); }
            return wrap;
          }
        }
        break;
      case 'json':
        input = el('textarea', { id: id, 'data-path': path, spellcheck: 'false' });
        input.value = value === undefined ? '' : value;
        break;
      case 'bool':
        input = el('input', { type: 'checkbox', id: id, 'data-path': path, checked: !!value });
        wrap.appendChild(el('label', { for: id }, [input, ' ' + fieldLabel(field)]));
        if (field.hint) { wrap.appendChild(el('span', { class: 'hint', text: field.hint })); }
        return wrap;
      case 'timestamp':
      case 'number':
        input = el('input', { type: 'number', id: id, 'data-path': path, step: '1' });
        input.value = value === undefined ? '' : value;
        break;
      default:
        input = el('input', { type: 'text', id: id, 'data-path': path, placeholder: field.placeholder });
        input.value = value === undefined ? '' : value;
    }
    wrap.appendChild(label);
    if (field.type === 'timestamp') {
      wrap.appendChild(el('div', { class: 'with-btn' }, [input, el('button', { type: 'button', class: 'btn small', 'data-action': 'now', 'data-target': path, text: 'Now' })]));
    } else {
      wrap.appendChild(input);
    }
    if (field.hint) { wrap.appendChild(el('span', { class: 'hint', text: field.hint })); }
    return wrap;
  }

  function buildFields(fields, prefix) {
    var frag = document.createDocumentFragment();
    var row = null;
    var values = prefix === 'ev' ? (state.events[state.event] || {}) : {};
    fields.forEach(function (field) {
      if (field.when && !field.when(values)) { return; }
      var node = buildField(field, prefix + '.' + field.name);
      var wide = field.type === 'json' || field.type === 'i18n' || field.type === 'list';
      if (wide) { row = null; frag.appendChild(node); return; }
      if (!row) { row = el('div', { class: 'field-row' }); frag.appendChild(row); }
      row.appendChild(node);
      if (row.children.length === 2) { row = null; }
    });
    return frag;
  }

  function buildProfiles() {
    var tabs = document.getElementById('profiles');
    tabs.innerHTML = '';
    PROFILES.forEach(function (p) {
      tabs.appendChild(el('button', { type: 'button', role: 'tab', 'data-profile': p.id, 'aria-selected': p.id === state.profile ? 'true' : 'false', tabindex: p.id === state.profile ? '0' : '-1', text: p.label }));
    });
  }

  function buildEvent() {
    var profile = profileOf(state.profile);
    var version = versionOf(profile);
    var ev = currentEvent();
    var versions = document.getElementById('spec-version');
    versions.innerHTML = '';
    profile.versions.forEach(function (v) { versions.appendChild(el('option', { value: v.id, text: v.spec })); });
    versions.value = version.id;
    versions.dataset.path = 'versions.' + profile.id;
    var select = document.getElementById('event-type');
    select.innerHTML = '';
    version.events.forEach(function (e) {
      select.appendChild(el('option', { value: e.uri, text: shortName(e.uri) }));
    });
    select.value = ev.uri;
    var info = document.getElementById('event-info');
    info.innerHTML = '';
    info.appendChild(document.createTextNode(ev.description + ' '));
    info.appendChild(el('a', { href: sectionUrl(version, ev), text: version.spec + ', section ' + ev.section }));
    info.appendChild(document.createTextNode('. Type '));
    info.appendChild(el('code', { text: ev.uri }));
    info.appendChild(document.createTextNode(', in easyssf also '));
    info.appendChild(el('a', { href: '#event-' + ev.alias }, [el('code', { text: ev.alias })]));
    info.appendChild(document.createTextNode('.'));
    var fields = document.getElementById('event-fields');
    fields.innerHTML = '';
    if (ev.fields.length === 0) {
      fields.appendChild(el('p', { class: 'event-info', text: 'This event has no claims of its own; its payload is an empty object.' }));
    } else {
      fields.appendChild(buildFields(ev.fields, 'ev'));
    }
  }

  // The format select and the fields of a simple identifier at the given state path.
  function buildIdentifier(path, formats, allowComplex) {
    var frag = document.createDocumentFragment();
    var format = get(path + '.format');
    if (!format || (formats.indexOf(format) < 0 && !(allowComplex && format === 'complex'))) {
      format = formats[0];
      set(path + '.format', format);
    }
    var selectId = 'f' + (++fieldSeq);
    var select = el('select', { id: selectId, 'data-path': path + '.format', 'data-rebuild': '' });
    formats.forEach(function (k) { select.appendChild(el('option', { value: k, text: FORMATS[k].label })); });
    if (allowComplex) { select.appendChild(el('option', { value: 'complex', text: FORMATS.complex.label })); }
    select.value = format;
    var field = el('div', { class: 'field' }, [el('label', { for: selectId, text: 'Format' }), select]);
    frag.appendChild(field);
    if (format !== 'complex') {
      frag.appendChild(buildFields(FORMATS[format].fields, path + '.' + format));
    }
    return frag;
  }

  function buildSubject() {
    var ev = currentEvent();
    var profile = profileOf(state.profile);
    var container = document.getElementById('subject');
    container.innerHTML = '';
    var formats = ev.subjectFormats || (profile.subjectFormat === 'stream' ? ['stream'] : SIMPLE_FORMATS);
    var allowComplex = !ev.subjectFormats && profile.subjectFormat !== 'stream';
    container.appendChild(buildIdentifier('subject', formats, allowComplex));
    if (get('subject.format') === 'complex') {
      FORMATS.complex.members.forEach(function (member) {
        var mpath = 'subject.members.' + member;
        if (get(mpath + '.on') === undefined) {
          var d = MEMBER_DEFAULTS[member];
          Object.keys(d).forEach(function (k) { set(mpath + '.' + k, JSON.parse(JSON.stringify(d[k]))); });
        }
        var on = !!get(mpath + '.on');
        var id = 'm-' + member;
        var box = el('div', { class: 'member' });
        box.appendChild(el('div', { class: 'field check' }, [
          el('label', { for: id }, [el('input', { type: 'checkbox', id: id, 'data-path': mpath + '.on', 'data-rebuild': '', checked: on }), ' ', el('code', { text: member })])
        ]));
        if (on) {
          var inner = el('div', { class: 'member-fields' });
          inner.appendChild(buildIdentifier(mpath, SIMPLE_FORMATS, false));
          box.appendChild(inner);
        }
        container.appendChild(box);
      });
    }
  }

  // Writes the state into the static inputs (token, push).
  function fillStatic() {
    document.querySelectorAll('#gen fieldset:last-of-type [data-path], #ev-extra').forEach(function (input) {
      var v = get(input.dataset.path);
      if (input.type === 'checkbox') { input.checked = !!v; } else { input.value = v === undefined ? '' : v; }
    });
  }

  function rebuild() {
    buildProfiles();
    buildEvent();
    buildSubject();
    fillStatic();
    render();
  }

  // Reads one input into the state.
  function readInput(input) {
    var path = input.dataset.path;
    if (!path) { return; }
    if (input.type === 'checkbox') { set(path, input.checked); }
    else if (input.type === 'number') { set(path, input.value === '' ? '' : Number(input.value)); }
    else { set(path, input.value); }
  }

  // ---- building the SET -----------------------------------------------------------------------

  function fieldValue(field, raw, problems, where) {
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) { problems.push(where + ': ' + fieldLabel(field) + ' is required.'); }
      return undefined;
    }
    switch (field.type) {
      case 'timestamp': case 'number': return Number(raw);
      case 'i18n': return { en: String(raw) };
      case 'list': return String(raw).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      case 'json':
        try { return JSON.parse(raw); } catch (e) { problems.push(where + ': ' + fieldLabel(field) + ' is not valid JSON (' + e.message + ').'); return undefined; }
      case 'bool': return !!raw;
      default: return raw;
    }
  }

  function buildIdentifierValue(path, problems, where) {
    var format = get(path + '.format');
    var def = FORMATS[format];
    if (!def) { return undefined; }
    var out = { format: def.format || format };
    def.fields.forEach(function (field) {
      var v = fieldValue(field, get(path + '.' + format + '.' + field.name), problems, where);
      if (v !== undefined) { out[field.name] = v; }
    });
    return out;
  }

  function buildSubjectValue(problems) {
    if (get('subject.format') === 'complex') {
      var out = { format: 'complex' };
      var any = false;
      FORMATS.complex.members.forEach(function (member) {
        if (get('subject.members.' + member + '.on')) {
          out[member] = buildIdentifierValue('subject.members.' + member, problems, 'Subject ' + member);
          any = true;
        }
      });
      if (!any) { problems.push('Subject: a complex subject needs at least one member.'); }
      return out;
    }
    return buildIdentifierValue('subject', problems, 'Subject');
  }

  function buildSet() {
    var problems = [];
    var ev = currentEvent();
    var payload = {};
    var values = state.events[state.event] || {};
    ev.fields.forEach(function (field) {
      if (field.when && !field.when(values)) { return; }
      var v = fieldValue(field, get('ev.' + field.name), problems, 'Event');
      if (v !== undefined) { payload[field.name] = v; }
    });
    merge(payload, get('ev.$extra'), problems, 'Event: the custom claims');
    var subject = buildSubjectValue(problems);
    if (state.token.legacySubject) { payload.subject = subject; }
    var t = state.token;
    ['iss', 'aud', 'jti'].forEach(function (k) { if (!t[k]) { problems.push('Token: ' + k + ' is required.'); } });
    if (t.iat === '' || t.iat === undefined || isNaN(Number(t.iat))) { problems.push('Token: iat is required.'); }
    var auds = String(t.aud || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var claims = { iss: t.iss, jti: t.jti, iat: Number(t.iat), aud: auds.length === 1 ? auds[0] : auds };
    if (t.txn) { claims.txn = t.txn; }
    claims.sub_id = subject;
    claims.events = {};
    claims.events[ev.uri] = payload;
    merge(claims, t.extra, problems, 'Token: the custom claims');
    return { claims: claims, problems: problems };
  }

  // Merges the custom claims, a JSON object as text, into the target; they win over the
  // standard claims of the same name.
  function merge(target, text, problems, where) {
    if (!text || !String(text).trim()) { return; }
    var extra;
    try { extra = JSON.parse(text); } catch (e) { problems.push(where + ' are not valid JSON (' + e.message + ').'); return; }
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) { problems.push(where + ' have to be a JSON object.'); return; }
    Object.keys(extra).forEach(function (k) { target[k] = extra[k]; });
  }

  // ---- signing --------------------------------------------------------------------------------

  var KEY_ALGS = {
    RS256: { gen: { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, use: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, sign: { name: 'RSASSA-PKCS1-v1_5' } },
    ES256: { gen: { name: 'ECDSA', namedCurve: 'P-256' }, use: { name: 'ECDSA', namedCurve: 'P-256' }, sign: { name: 'ECDSA', hash: 'SHA-256' } }
  };
  var KEYS_STORAGE = 'easyssf.tools.keys';
  var keyCache = {};

  function storedKeys() { try { return JSON.parse(localStorage.getItem(KEYS_STORAGE) || '{}'); } catch (e) { return {}; } }
  function storeKey(alg, jwk) {
    var all = storedKeys(); all[alg] = jwk;
    try { localStorage.setItem(KEYS_STORAGE, JSON.stringify(all)); } catch (e) { /* storage unavailable */ }
  }
  function subtle() { return (window.crypto && crypto.subtle) || null; }

  // The private JWK of the algorithm, generated and stored on first use, imported for signing.
  function getKey(alg, fresh) {
    if (!subtle()) { return Promise.reject(new Error('Web Crypto is not available; the page has to be served over HTTPS or from localhost.')); }
    if (!fresh && keyCache[alg]) { return keyCache[alg]; }
    var spec = KEY_ALGS[alg];
    var stored = fresh ? null : storedKeys()[alg];
    var p;
    if (stored) {
      p = subtle().importKey('jwk', stored, spec.use, true, ['sign']).then(function (key) { return { jwk: stored, key: key }; })
        .catch(function () { return generate(); });
    } else {
      p = generate();
    }
    function generate() {
      return subtle().generateKey(spec.gen, true, ['sign', 'verify']).then(function (pair) {
        return subtle().exportKey('jwk', pair.privateKey).then(function (jwk) {
          jwk.kid = alg.toLowerCase() + '-' + hex(4);
          jwk.alg = alg; jwk.use = 'sig';
          delete jwk.key_ops; delete jwk.ext;
          storeKey(alg, jwk);
          return { jwk: jwk, key: pair.privateKey };
        });
      });
    }
    keyCache[alg] = p.then(function (k) {
      var pub = {};
      Object.keys(k.jwk).forEach(function (name) { if (['d', 'p', 'q', 'dp', 'dq', 'qi', 'key_ops', 'ext'].indexOf(name) < 0) { pub[name] = k.jwk[name]; } });
      k.publicJwk = pub;
      return k;
    });
    return keyCache[alg];
  }

  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) { s += String.fromCharCode(bytes[i]); }
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlText(text) { return b64url(new TextEncoder().encode(text)); }
  function b64urlDecodeText(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) { s += '='; }
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
    return new TextDecoder().decode(bytes);
  }

  // Signs the claims as a SET: returns {jwt, header, key} (key is null when unsigned).
  function sign(claims, alg) {
    if (alg === 'none') {
      var header = { alg: 'none', typ: 'secevent+jwt' };
      return Promise.resolve({ jwt: b64urlText(JSON.stringify(header)) + '.' + b64urlText(JSON.stringify(claims)) + '.', header: header, key: null });
    }
    return getKey(alg).then(function (k) {
      var header = { alg: alg, kid: k.jwk.kid, typ: 'secevent+jwt' };
      var input = b64urlText(JSON.stringify(header)) + '.' + b64urlText(JSON.stringify(claims));
      return subtle().sign(KEY_ALGS[alg].sign, k.key, new TextEncoder().encode(input)).then(function (sig) {
        return { jwt: input + '.' + b64url(new Uint8Array(sig)), header: header, key: k };
      });
    });
  }

  // ---- output ---------------------------------------------------------------------------------

  var renderSeq = 0;
  function render() {
    var built = buildSet();
    var seq = ++renderSeq;
    var setNode = document.getElementById('set-json');
    setNode.textContent = JSON.stringify(built.claims, null, 2);
    // the payload of the event alone, for "Copy event"
    setNode.dataset.eventText = JSON.stringify(built.claims.events[currentEvent().uri], null, 2);
    var problems = document.getElementById('problems');
    problems.innerHTML = '';
    if (built.problems.length) {
      problems.appendChild(el('ul', {}, built.problems.map(function (p) { return el('li', { text: p }); })));
    }
    document.querySelectorAll('.field.invalid').forEach(function (n) { n.classList.remove('invalid'); });
    var iat = Number(state.token.iat);
    document.getElementById('iat-human').textContent = isNaN(iat) || state.token.iat === '' ? '' : new Date(iat * 1000).toISOString();

    var alg = state.token.alg || 'RS256';
    var jwtNode = document.getElementById('jwt-compact');
    sign(built.claims, alg).then(function (signed) {
      if (seq !== renderSeq) { return; }
      var parts = signed.jwt.split('.');
      jwtNode.innerHTML = '';
      jwtNode.appendChild(el('span', { class: 'h', text: parts[0] }));
      jwtNode.appendChild(document.createTextNode('.'));
      jwtNode.appendChild(el('span', { class: 'p', text: parts[1] }));
      jwtNode.appendChild(document.createTextNode('.' + parts[2]));
      jwtNode.dataset.copyText = signed.jwt;
      document.getElementById('jwt-header').textContent = JSON.stringify(signed.header, null, 2);
      document.getElementById('jwt-note').textContent = alg === 'none'
        ? 'Unsigned: shows the structure only, every receiver rejects a SET without a signature.'
        : 'Signed with an ' + alg + ' key generated in this browser, kid ' + signed.header.kid + '.';
      renderKeys(alg);
    }).catch(function (e) {
      if (seq !== renderSeq) { return; }
      jwtNode.textContent = '';
      document.getElementById('jwt-header').textContent = '';
      document.getElementById('jwt-note').textContent = 'The SET could not be signed: ' + e.message;
      document.getElementById('jwks').textContent = '';
      document.getElementById('jwk-private').textContent = '';
    });
  }

  function renderKeys(alg) {
    if (alg === 'none') {
      document.getElementById('jwks').textContent = '';
      document.getElementById('jwk-private').textContent = '';
      return;
    }
    getKey(alg).then(function (k) {
      document.getElementById('jwks').textContent = JSON.stringify({ keys: [k.publicJwk] }, null, 2);
      document.getElementById('jwk-private').textContent = JSON.stringify(k.jwk, null, 2);
    });
  }

  // ---- token presets --------------------------------------------------------------------------

  // Named presets of the token settings, iss, aud, alg, the legacy subject option and the
  // custom claims of the SET, kept in localStorage for the demo setups one comes back to.
  var PRESETS_STORAGE = 'easyssf.tools.presets';
  var PRESET_KEYS = ['iss', 'aud', 'alg', 'legacySubject', 'extra'];

  function presets() { try { return JSON.parse(localStorage.getItem(PRESETS_STORAGE) || '{}') || {}; } catch (e) { return {}; } }
  function storePresets(all) { try { localStorage.setItem(PRESETS_STORAGE, JSON.stringify(all)); } catch (e) { /* storage unavailable */ } }

  function renderPresets(selected) {
    var select = document.getElementById('tok-preset');
    var all = presets();
    var names = Object.keys(all).sort(function (a, b) { return a.localeCompare(b); });
    select.innerHTML = '';
    select.appendChild(el('option', { value: '', text: names.length ? 'Choose a preset\u2026' : 'None saved yet' }));
    names.forEach(function (name) { select.appendChild(el('option', { value: name, text: name })); });
    select.value = selected && all[selected] ? selected : '';
    select.disabled = names.length === 0;
  }

  function savePreset() {
    var input = document.getElementById('tok-preset-name');
    var name = input.value.trim();
    if (!name) {
      // the host of the issuer makes a reasonable name
      try { name = new URL(state.token.iss).host; } catch (e) { name = 'Preset'; }
    }
    var preset = {};
    PRESET_KEYS.forEach(function (k) { preset[k] = state.token[k]; });
    var all = presets();
    all[name] = preset;
    storePresets(all);
    input.value = '';
    renderPresets(name);
  }

  function applyPreset(name) {
    var preset = presets()[name];
    if (!preset) { return; }
    PRESET_KEYS.forEach(function (k) { if (preset[k] !== undefined) { state.token[k] = preset[k]; } });
    fillStatic();
    render();
  }

  function deletePreset() {
    var select = document.getElementById('tok-preset');
    var all = presets();
    if (!select.value || !all[select.value]) { return; }
    delete all[select.value];
    storePresets(all);
    renderPresets('');
  }

  document.getElementById('tok-preset').addEventListener('change', function (e) { applyPreset(e.target.value); });
  document.getElementById('tok-preset-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); savePreset(); }
  });
  renderPresets('');

  // ---- the URL fragment -----------------------------------------------------------------------

  // "Copy as link" copies a link with the state in the fragment, without touching the address
  // bar; a page opened from such a link reads the state and drops the fragment again.
  function stateLink() {
    return location.origin + location.pathname + location.search + '#set=' + b64urlText(JSON.stringify(state));
  }
  function fromHash() {
    var m = /#set=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) { return null; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    try {
      var s = JSON.parse(b64urlDecodeText(m[1]));
      if (!s || typeof s !== 'object' || !s.token) { return null; }
      var d = defaultState();
      ['token', 'subject'].forEach(function (k) { s[k] = Object.assign({}, d[k], s[k] || {}); });
      s.events = s.events || {};
      s.versions = s.versions || {};
      return s;
    } catch (e) { return null; }
  }

  // ---- events ---------------------------------------------------------------------------------

  form.addEventListener('input', function (e) {
    if (e.target.dataset.path) { readInput(e.target); render(); }
  });
  form.addEventListener('change', function (e) {
    var t = e.target;
    if (!t.dataset.path) { return; }
    readInput(t);
    if (t.dataset.rebuild !== undefined) {
      if (t.dataset.path === 'event') { onEventChange(); }
      rebuild();
    } else {
      render();
    }
  });
  // Events that restrict the subject, the RISC identifier events, force a format; the one from
  // before comes back with the next event that does not. An event with a subjectDefault gets it
  // as long as the subject format is still the one the page chose, not one the user picked.
  function onEventChange() {
    var ev = currentEvent();
    var format = get('subject.format');
    if (ev.subjectFormats) {
      if (ev.subjectFormats.indexOf(format) < 0) {
        if (!get('subject.beforeForced')) { set('subject.beforeForced', format); }
        set('subject.format', ev.subjectFormats[0]);
      }
      return;
    }
    if (get('subject.beforeForced')) {
      format = get('subject.beforeForced');
      set('subject.format', format);
      set('subject.beforeForced', '');
    }
    if (ev.subjectDefault && format === get('subject.autoFormat')) {
      set('subject.format', ev.subjectDefault);
      set('subject.autoFormat', ev.subjectDefault);
    }
  }

  function selectProfile(id) {
    var prev = profileOf(state.profile);
    var next = profileOf(id);
    if (prev === next) { return; }
    // Remember the subject of the user events, so that it comes back after the SCIM and SSF
    // profiles with their own kind of subject.
    if (!prev.subjectFormat) { set('subject.userFormat', get('subject.format')); }
    state.profile = next.id;
    if (!eventIn(versionOf(next), state.event)) { state.event = versionOf(next).events[0].uri; }
    if (next.subjectFormat) {
      set('subject.format', next.subjectFormat);
    } else if (prev.subjectFormat) {
      set('subject.format', get('subject.userFormat') || 'complex');
    }
    onEventChange();
    rebuild();
  }

  document.getElementById('profiles').addEventListener('click', function (e) {
    var tab = e.target.closest('[role="tab"]');
    if (tab) { selectProfile(tab.dataset.profile); tab.focus(); }
  });
  document.getElementById('profiles').addEventListener('keydown', function (e) {
    var tabs = Array.prototype.slice.call(e.currentTarget.querySelectorAll('[role="tab"]'));
    var index = tabs.indexOf(document.activeElement);
    if (index < 0) { return; }
    var next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { next = tabs[(index + 1) % tabs.length]; }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { next = tabs[(index - 1 + tabs.length) % tabs.length]; }
    else if (e.key === 'Home') { next = tabs[0]; }
    else if (e.key === 'End') { next = tabs[tabs.length - 1]; }
    if (next) { e.preventDefault(); selectProfile(next.dataset.profile); document.querySelector('#profiles [data-profile="' + next.dataset.profile + '"]').focus(); }
  });

  // A tablist whose tabs show the panel they control: returns a function that selects a panel
  // by id. Used for the output tabs and for the tool switcher of the page.
  function tablist(list, onSelect) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (other) {
        var selected = other === tab;
        other.setAttribute('aria-selected', selected ? 'true' : 'false');
        other.tabIndex = selected ? 0 : -1;
        document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
      });
      if (focus) { tab.focus(); }
      if (onSelect) { onSelect(tab.getAttribute('aria-controls')); }
    }
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var next;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { next = tabs[(index + 1) % tabs.length]; }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { next = tabs[(index - 1 + tabs.length) % tabs.length]; }
        else if (e.key === 'Home') { next = tabs[0]; }
        else if (e.key === 'End') { next = tabs[tabs.length - 1]; }
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
    return function (panelId) {
      var tab = tabs.filter(function (t) { return t.getAttribute('aria-controls') === panelId; })[0];
      if (tab) { select(tab, false); }
      return !!tab;
    };
  }

  tablist(document.getElementById('outputs'));

  // The tool switcher: one of the generator, the inspector, the event types and the other
  // tools is shown. A link with a fragment, tools.html#inspector or an event card, opens the
  // tool that holds it; switching tools does not touch the address bar.
  var showTool = tablist(document.getElementById('tools'));

  // Shows the tool that holds the element the fragment names, opens it if it is a card, and
  // scrolls to it, instantly on load and smoothly on a click. Returns whether the fragment
  // named something.
  function revealHash(instant) {
    var id = location.hash.slice(1);
    if (!id || /^set=/.test(id)) { return false; }
    var target = document.getElementById(id);
    if (!target) { return false; }
    var panel = target.closest('.tool-panel');
    if (panel) { showTool(panel.id); }
    if (target.tagName === 'DETAILS') { target.open = true; }
    target.scrollIntoView(instant === true ? { behavior: 'instant' } : undefined);
    return true;
  }
  window.addEventListener('hashchange', function () { revealHash(false); });

  // Buttons: actions in the form and copy buttons in the output.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) { return; }
    if (btn.dataset.copy) {
      var source = document.getElementById(btn.dataset.copy);
      var text = btn.dataset.copyAttr ? source.dataset[btn.dataset.copyAttr] : (source.dataset.copyText || source.textContent);
      copy(text, btn);
      return;
    }
    switch (btn.dataset.action) {
      case 'jti': set('token.jti', uuid()); fillStatic(); render(); break;
      case 'iat': set('token.iat', now()); fillStatic(); render(); break;
      case 'txn': set('token.txn', hex(16)); fillStatic(); render(); break;
      case 'preset-save': savePreset(); break;
      case 'preset-delete': deletePreset(); break;
      case 'now': set(btn.dataset.target, now()); rebuild(); break;
      case 'fresh':
        set('token.jti', uuid()); set('token.iat', now()); set('token.txn', hex(16));
        currentEvent().fields.forEach(function (field) { if (field.type === 'timestamp' && get('ev.' + field.name) !== '') { set('ev.' + field.name, now()); } });
        rebuild();
        break;
      case 'example':
        // Dropping the values of the event lets the defaults of its fields apply again.
        state.events[state.event] = {};
        rebuild();
        break;
      case 'minimal':
        currentEvent().fields.forEach(function (field) {
          if (!field.required) { set('ev.' + field.name, ''); }
          if (field.other) { set('ev.' + field.name + ':other', false); }
        });
        rebuild();
        break;
      case 'reset':
        state = defaultState();
        rebuild();
        break;
      case 'link':
        copy(stateLink(), btn);
        break;
      case 'newkey':
        if (state.token.alg === 'none') { break; }
        keyCache = {};
        getKey(state.token.alg, true).then(function () { render(); });
        break;
      default:
    }
  });

  function copy(text, btn) {
    // The feedback names what was copied, so that neighbouring buttons stay apart.
    var done = function () {
      if (btn.hasAttribute('data-copied')) { return; }
      var label = btn.textContent;
      btn.textContent = btn.dataset.copiedLabel || 'Copied';
      btn.setAttribute('data-copied', '');
      setTimeout(function () { btn.textContent = label; btn.removeAttribute('data-copied'); }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  // The section of the specification that defines an event, as a link: the published specs
  // all carry xml2rfc anchors of the form #section-3.1.
  function sectionUrl(version, ev) { return version.specUrl + '#section-' + ev.section; }

  // The official name of an event type: the URI without the base of its profile.
  function shortName(uri) {
    return uri.replace(/^https:\/\/schemas\.openid\.net\/secevent\/[a-z]+\/event-type\//, '').replace(SCIM, '');
  }

  // ---- the event listing ----------------------------------------------------------------------

  // Every event type of the catalog, by profile: the common claims once, then a card per event
  // with its URI, description and own claims, and a button that opens it in the generator.
  (function () {
    var root = document.getElementById('event-list');
    if (!root) { return; }
    function claimList(fields) {
      var list = el('ul', { class: 'claims' });
      fields.forEach(function (field) {
        var item = el('li', {}, [
          el('code', { text: field.name }),
          el('span', { class: 'req-badge' + (field.required ? ' required' : ''), text: field.required ? 'required' : 'optional' }),
          ' ', field.doc || field.hint || ''
        ]);
        if (field.options) {
          item.appendChild(el('span', { class: 'values' }, [' Values: '].concat(field.options.map(function (o, i) {
            return el('span', {}, [i ? ', ' : '', el('code', { text: o })]);
          }), field.other ? [', or another agreed with the receiver'] : [])));
        }
        list.appendChild(item);
      });
      return list;
    }
    PROFILES.forEach(function (profile) {
      var section = el('div', { class: 'event-profile', id: 'events-' + profile.id });
      var heading = el('h3', {}, [profile.label + ' events']);
      profile.versions.forEach(function (version, i) {
        heading.appendChild(el('span', { class: 'rfc' }, [i ? ' · ' : '', el('a', { href: version.specUrl, text: version.spec })]));
      });
      section.appendChild(heading);
      var intro = profile.versions[0].intro;
      if (intro) { section.appendChild(el('p', { class: 'muted', text: intro })); }
      // The events of all versions, in order of first appearance; each with the versions it
      // is in, so that a new version of a specification adds its events here with a badge.
      var entries = [], byUri = {};
      profile.versions.forEach(function (version) {
        version.events.forEach(function (ev) {
          if (!byUri[ev.uri]) { byUri[ev.uri] = { ev: ev, version: version, versions: [] }; entries.push(byUri[ev.uri]); }
          byUri[ev.uri].versions.push(version);
        });
      });
      var common = [], seen = {};
      entries.forEach(function (entry) {
        entry.ev.fields.forEach(function (field) { if (field.common && !seen[field.name]) { seen[field.name] = true; common.push(field); } });
      });
      if (common.length) { section.appendChild(claimList(common)); }
      entries.forEach(function (entry) {
        var ev = entry.ev, version = entry.version;
        var own = ev.fields.filter(function (field) { return !field.common; });
        var card = el('details', { class: 'event', id: 'event-' + ev.alias });
        var summary = el('summary', {}, [
          el('span', { class: 'title', text: ev.title || shortName(ev.uri) }),
          el('code', { class: 'alias', text: ev.alias })
        ]);
        if (entry.versions.length < profile.versions.length) {
          summary.appendChild(el('span', { class: 'since', text: entry.versions.map(function (v) { return v.id; }).join(', ') }));
        }
        summary.appendChild(el('span', { class: 'spec', text: 'section ' + ev.section }));
        card.appendChild(summary);
        var body = el('div', { class: 'event-body' });
        body.appendChild(el('p', {}, ['URI: ', el('code', { text: ev.uri }), ', defined in ',
          el('a', { href: sectionUrl(version, ev), text: version.spec + ', section ' + ev.section }), '.']));
        body.appendChild(el('p', { text: ev.description }));
        body.appendChild(el('p', { class: 'label', text: own.length ? 'Event-specific claims:' : 'No event-specific claims; the payload is an empty object.' }));
        if (own.length) { body.appendChild(claimList(own)); }
        if (ev.subjectFormats) { body.appendChild(el('p', {}, ['Subject: an identifier of format ' + ev.subjectFormats.join(' or ') + '.'])); }
        body.appendChild(el('p', { class: 'actions' }, [el('button', { type: 'button', class: 'btn small', 'data-open-event': ev.uri, 'data-open-profile': profile.id, 'data-open-version': version.id, text: 'Open in generator' })]));
        card.appendChild(body);
        section.appendChild(card);
      });
      root.appendChild(section);
    });
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-open-event]');
      if (!btn) { return; }
      selectProfile(btn.dataset.openProfile);
      set('versions.' + btn.dataset.openProfile, btn.dataset.openVersion);
      state.event = btn.dataset.openEvent;
      onEventChange();
      rebuild();
      showTool('generator');
      document.getElementById('tools').scrollIntoView();
    });
  })();

  // ---- the inspector --------------------------------------------------------------------------

  var ALIASES = {};
  PROFILES.forEach(function (p) { p.versions.forEach(function (v) { v.events.forEach(function (e) { ALIASES[e.uri] = e.alias; }); }); });

  function inspect(text) {
    var problems = document.getElementById('inspect-problems');
    var summary = document.getElementById('inspect-summary');
    var out = document.getElementById('inspect-out');
    problems.innerHTML = ''; summary.innerHTML = ''; summary.hidden = true; out.hidden = true;
    text = text.trim();
    if (!text) { return; }
    var header = null, claims = null, signature = null;
    try {
      if (text.charAt(0) === '{') {
        claims = JSON.parse(text);
      } else {
        var parts = text.split('.');
        if (parts.length !== 3) { throw new Error('A compact JWT has three parts separated by dots, this has ' + parts.length + '.'); }
        header = JSON.parse(b64urlDecodeText(parts[0]));
        claims = JSON.parse(b64urlDecodeText(parts[1]));
        signature = parts[2];
      }
    } catch (e) {
      problems.textContent = 'Could not read this: ' + e.message;
      return;
    }
    var notes = [];
    if (header) {
      if (header.typ !== 'secevent+jwt') { notes.push('The header typ is ' + JSON.stringify(header.typ) + ', SSF requires secevent+jwt.'); }
      if (header.alg === 'none' || !signature) { notes.push('The token is unsigned.'); }
    }
    if (!claims.sub_id) { notes.push('No top-level sub_id claim, which SSF 1.0 requires.'); }
    if (!claims.events || typeof claims.events !== 'object') { notes.push('No events claim.'); }
    if (notes.length) { problems.appendChild(el('ul', {}, notes.map(function (n) { return el('li', { text: n }); }))); }

    function row(term, value) {
      summary.appendChild(el('dt', { text: term }));
      summary.appendChild(el('dd', {}, typeof value === 'string' ? [value] : value));
    }
    if (header) { row('Header', [el('code', { text: 'alg ' + header.alg + (header.kid ? ', kid ' + header.kid : '') + (header.typ ? ', typ ' + header.typ : '') })]); }
    if (claims.iss) { row('Issuer', String(claims.iss)); }
    if (claims.aud) { row('Audience', Array.isArray(claims.aud) ? claims.aud.join(', ') : String(claims.aud)); }
    if (claims.iat) { row('Issued at', claims.iat + ', ' + new Date(Number(claims.iat) * 1000).toISOString()); }
    if (claims.jti) { row('Token id', [el('code', { text: String(claims.jti) })]); }
    if (claims.txn) { row('Transaction', [el('code', { text: String(claims.txn) })]); }
    if (claims.sub_id) { row('Subject', describeSubject(claims.sub_id)); }
    if (claims.events && typeof claims.events === 'object') {
      Object.keys(claims.events).forEach(function (uri) {
        var alias = ALIASES[uri];
        var payload = claims.events[uri] || {};
        var ts = payload.event_timestamp ? ', at ' + new Date(Number(payload.event_timestamp) * 1000).toISOString() : '';
        row('Event', [alias ? el('code', { text: alias }) : el('span', { text: 'unknown type' }), ' ', el('span', { class: 'muted', text: uri + ts })]);
      });
    }
    summary.hidden = false;
    document.getElementById('inspect-json').textContent = (header ? JSON.stringify(header, null, 2) + '\n.\n' : '') + JSON.stringify(claims, null, 2);
    out.hidden = false;
  }

  function describeSubject(sub) {
    if (!sub || typeof sub !== 'object') { return [String(sub)]; }
    if (sub.format === 'complex') {
      var parts = [];
      Object.keys(sub).forEach(function (k) {
        if (k === 'format') { return; }
        parts.push(el('div', {}, [el('code', { text: k }), ' ', describeSimple(sub[k])]));
      });
      return parts;
    }
    return [describeSimple(sub)];
  }
  function describeSimple(id) {
    if (!id || typeof id !== 'object') { return String(id); }
    var fields = Object.keys(id).filter(function (k) { return k !== 'format'; }).map(function (k) { return k + '=' + (typeof id[k] === 'string' ? id[k] : JSON.stringify(id[k])); });
    return id.format + ' (' + fields.join(', ') + ')';
  }

  document.getElementById('inspect-in').addEventListener('input', function (e) { inspect(e.target.value); });

  // ---- start ----------------------------------------------------------------------------------

  state = fromHash() || defaultState();
  rebuild();
  if (revealHash(true)) {
    // The browser scrolls to the fragment again when the page has loaded; do so too, then.
    if (document.readyState !== 'complete') {
      window.addEventListener('load', function () { setTimeout(function () { revealHash(true); }, 0); }, { once: true });
    }
  } else {
    showTool('generator');
  }
})();
