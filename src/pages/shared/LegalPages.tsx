import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GuidelightWordmark } from '@/components/BrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  APP_URL,
  COPYRIGHT_LINE,
  LEGAL_EFFECTIVE_DATE,
  OPERATOR_ADDRESS,
  OPERATOR_NAME,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
} from '@/lib/legal'

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="text-xl" aria-label={`${PRODUCT_NAME} home`}>
            <GuidelightWordmark />
          </Link>
          <ThemeToggle className="border-border/40 bg-card/40 shadow-sm" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-xs text-muted-foreground">
          Operated by {OPERATOR_NAME} · Effective {LEGAL_EFFECTIVE_DATE}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 rounded-md border border-border/50 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          These documents are product drafts tailored to how {PRODUCT_NAME} works today. They are not
          legal advice. Have a UK solicitor review them before you rely on them for launch or
          compliance.
        </p>
        <div className="prose-legal mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </main>

      <footer className="mx-auto max-w-3xl border-t border-border/60 px-6 py-8 text-center text-xs text-muted-foreground">
        <nav className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Link to="/terms" className="underline-offset-4 hover:text-foreground hover:underline">
            Terms
          </Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <a href={SUPPORT_MAILTO} className="underline-offset-4 hover:text-foreground hover:underline">
            Contact
          </a>
        </nav>
        <p>{COPYRIGHT_LINE}</p>
      </footer>
    </div>
  )
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-semibold text-foreground">{children}</h2>
}

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>
}

function Ul({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5">{children}</ul>
}

export function TermsOfServicePage() {
  return (
    <LegalShell title="Terms of Service">
      <section className="space-y-3">
        <H2>1. Who we are</H2>
        <P>
          {PRODUCT_NAME} ({APP_URL}) is operated by {OPERATOR_NAME} (“we”, “us”, “our”), a company
          registered in the United Kingdom. Our registered address is {OPERATOR_ADDRESS}.
        </P>
        <P>
          Questions about these Terms: {SUPPORT_EMAIL}.
        </P>
      </section>

      <section className="space-y-3">
        <H2>2. The service</H2>
        <P>
          {PRODUCT_NAME} is an education platform for teachers and their students. Teachers can
          create classes and student accounts, assign homework and assessments, use AI-assisted
          tools (including marking, lesson planning, and related classroom features), and manage
          pay-as-you-go AI usage billing. Students access tasks and learning tools through accounts
          created or managed by their teacher.
        </P>
        <P>
          By creating a teacher account, signing in, or using the service, you agree to these Terms
          and our{' '}
          <Link to="/privacy" className="text-foreground underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          .
        </P>
      </section>

      <section className="space-y-3">
        <H2>3. Accounts and eligibility</H2>
        <Ul>
          <li>
            Teacher accounts require a valid email address and password (or email magic link). You
            must verify your email before signing in for the first time.
          </li>
          <li>
            You must provide accurate registration information and keep your credentials secure.
            You are responsible for activity under your account.
          </li>
          <li>
            Student accounts are created and managed by teachers for classroom use. Teachers are
            responsible for obtaining any consents required by their school or local law before
            adding student information.
          </li>
          <li>
            You must be able to enter a binding contract. If you use {PRODUCT_NAME} on behalf of a
            school or organisation, you confirm you have authority to bind that organisation.
          </li>
        </Ul>
      </section>

      <section className="space-y-3">
        <H2>4. Acceptable use</H2>
        <P>You agree not to:</P>
        <Ul>
          <li>Use the service for unlawful, harmful, or abusive purposes</li>
          <li>Attempt to access other users’ data without authorisation</li>
          <li>Interfere with or disrupt the service, security, or infrastructure</li>
          <li>Upload malware or content you do not have rights to use</li>
          <li>Misrepresent your identity or affiliation</li>
          <li>Use the service to generate or distribute content that violates applicable law</li>
        </Ul>
        <P>We may suspend or terminate accounts that breach these Terms.</P>
      </section>

      <section className="space-y-3">
        <H2>5. AI features</H2>
        <P>
          Some features use artificial intelligence hosted on Cloudflare Workers AI. Class and task
          content may be processed by that infrastructure to generate or mark work. Outputs are
          probabilistic: they may be incomplete, inaccurate, or inappropriate for a given student.
          Teachers remain responsible for reviewing AI-assisted materials and marks before relying
          on them for teaching, grading, or reporting decisions.
        </P>
        <P>
          We do not guarantee that AI features will be uninterrupted, error-free, or suitable for
          any particular educational outcome.
        </P>
      </section>

      <section className="space-y-3">
        <H2>6. Fees and billing</H2>
        <P>
          Teacher use of AI features is charged on a pay-as-you-go basis. There is no required
          subscription. Teachers may set a monthly spending cap. Payment processing is handled by
          Stripe. You authorise us and Stripe to charge amounts you incur according to the pricing
          and caps shown in the product.
        </P>
        <P>
          Fees, starter credits, and caps may change; material changes will be reflected in the
          product interface. Taxes may apply where required by law.
        </P>
      </section>

      <section className="space-y-3">
        <H2>7. Your content and intellectual property</H2>
        <P>
          You retain rights in content you (or your students) submit. You grant us a limited
          licence to host, process, and display that content solely to operate and improve the
          service (including AI processing described above).
        </P>
        <P>
          {PRODUCT_NAME}, its branding, software, and documentation remain our property or that of
          our licensors. These Terms do not transfer ownership of our IP to you.
        </P>
      </section>

      <section className="space-y-3">
        <H2>8. Availability and changes</H2>
        <P>
          We aim to keep the service available but do not guarantee uninterrupted access. We may
          modify, suspend, or discontinue features with reasonable notice where practicable. We may
          update these Terms; the effective date above will change when we do. Continued use after
          updates constitutes acceptance of the revised Terms.
        </P>
      </section>

      <section className="space-y-3">
        <H2>9. Disclaimers and liability</H2>
        <P>
          The service is provided “as is” and “as available” to the fullest extent permitted by
          law. We do not exclude or limit liability for death or personal injury caused by
          negligence, fraud, or any other liability that cannot be limited under English law.
        </P>
        <P>
          Subject to the previous sentence, we are not liable for indirect, incidental, special, or
          consequential loss; loss of profits, data, or goodwill; or educational outcomes. Our total
          aggregate liability arising out of or relating to the service in any 12-month period is
          limited to the greater of (a) the fees you paid us for AI usage in that period, or (b)
          £100.
        </P>
        <P>
          If you are a consumer with rights that cannot be waived under applicable law, those rights
          remain unaffected.
        </P>
      </section>

      <section className="space-y-3">
        <H2>10. Termination</H2>
        <P>
          You may stop using the service at any time. We may suspend or terminate access if you
          breach these Terms, fail to pay amounts due, or if we discontinue the service. Provisions
          that by nature should survive (including IP, disclaimers, and liability limits) will
          survive termination.
        </P>
      </section>

      <section className="space-y-3">
        <H2>11. Governing law</H2>
        <P>
          These Terms are governed by the laws of England and Wales. The courts of England and Wales
          have exclusive jurisdiction, subject to any mandatory consumer protections that apply in
          your country of residence.
        </P>
      </section>

      <section className="space-y-3">
        <H2>12. Contact</H2>
        <P>
          {OPERATOR_NAME}
          <br />
          {OPERATOR_ADDRESS}
          <br />
          Email:{' '}
          <a href={SUPPORT_MAILTO} className="text-foreground underline-offset-4 hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </P>
      </section>
    </LegalShell>
  )
}

export function PrivacyPolicyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <section className="space-y-3">
        <H2>1. Who is the controller?</H2>
        <P>
          {OPERATOR_NAME} (“we”, “us”, “our”) is the data controller for personal data processed
          through {PRODUCT_NAME} ({APP_URL}), except where a school or teacher is independently
          responsible for student data under their own policies. Our address is {OPERATOR_ADDRESS}.
        </P>
        <P>
          Privacy questions or data-subject requests: {SUPPORT_EMAIL}.
        </P>
      </section>

      <section className="space-y-3">
        <H2>2. Data we process</H2>
        <P>Depending on how you use the service, we may process:</P>
        <Ul>
          <li>
            <strong className="text-foreground">Teacher account data</strong> — name, email address,
            password hash, email verification and reset tokens, session identifiers
          </li>
          <li>
            <strong className="text-foreground">Student profile data</strong> — names, usernames,
            credentials, class membership, and related classroom metadata created by teachers
          </li>
          <li>
            <strong className="text-foreground">Learning activity</strong> — homework and assessment
            content, attempts, marks, reports, lesson materials, mock exams and archives,
            reading and CEFR-related activity
          </li>
          <li>
            <strong className="text-foreground">AI usage and billing</strong> — feature usage events,
            estimated token/cost metrics, spending caps, Stripe customer and subscription
            identifiers, billing email
          </li>
          <li>
            <strong className="text-foreground">Technical data</strong> — session cookies and basic
            request logs needed to operate and secure the service
          </li>
        </Ul>
      </section>

      <section className="space-y-3">
        <H2>3. Purposes and lawful bases</H2>
        <Ul>
          <li>
            <strong className="text-foreground">Provide the service</strong> — contract (teacher
            accounts) and legitimate interests / teacher instructions (student classroom use)
          </li>
          <li>
            <strong className="text-foreground">AI features</strong> — process task and attempt
            content via Cloudflare Workers AI to generate or mark work (contract / legitimate
            interests)
          </li>
          <li>
            <strong className="text-foreground">Billing</strong> — charge for AI usage via Stripe
            (contract / legal obligation for tax records)
          </li>
          <li>
            <strong className="text-foreground">Security and account recovery</strong> — verify
            email, magic links, password resets (legitimate interests / contract)
          </li>
          <li>
            <strong className="text-foreground">Support</strong> — respond to messages sent to{' '}
            {SUPPORT_EMAIL} (legitimate interests)
          </li>
        </Ul>
      </section>

      <section className="space-y-3">
        <H2>4. Processors and transfers</H2>
        <P>We use trusted processors to run the product:</P>
        <Ul>
          <li>
            <strong className="text-foreground">Cloudflare</strong> — hosting (Workers), database
            (D1), AI inference (Workers AI), transactional email sending, and (when configured)
            inbound email routing for support
          </li>
          <li>
            <strong className="text-foreground">Stripe</strong> — payment processing and customer
            billing portal
          </li>
        </Ul>
        <P>
          Cloudflare and Stripe may process data in the UK, EEA, United States, or other locations
          where they operate. Where transfers leave the UK/EEA, we rely on appropriate safeguards
          such as standard contractual clauses or the provider’s transfer mechanisms.
        </P>
        <P>
          We do not sell personal data. We do not send class data to OpenAI or ChatGPT for
          inference; AI features run on Cloudflare Workers AI as described in the product.
        </P>
      </section>

      <section className="space-y-3">
        <H2>5. Cookies</H2>
        <P>
          We use an essential session cookie to keep you signed in. We do not use third-party
          advertising or analytics cookies today. Because the session cookie is strictly necessary
          for the service to function, we do not show a separate cookie consent banner for it.
        </P>
      </section>

      <section className="space-y-3">
        <H2>6. Retention</H2>
        <P>
          We retain account and classroom data while your account is active and for a reasonable
          period afterwards so teachers can recover work or we can resolve disputes, comply with
          law, or secure the service. Billing records may be kept longer where tax or accounting
          rules require. You (or a teacher, for student accounts they control) may request deletion
          via {SUPPORT_EMAIL}; we will respond subject to legal retention needs.
        </P>
      </section>

      <section className="space-y-3">
        <H2>7. Your rights (UK GDPR)</H2>
        <P>Where UK GDPR applies, you may have the right to:</P>
        <Ul>
          <li>Access your personal data</li>
          <li>Rectify inaccurate data</li>
          <li>Erase data in certain circumstances</li>
          <li>Restrict or object to certain processing</li>
          <li>Data portability where processing is automated and based on contract or consent</li>
          <li>Withdraw consent where processing is based on consent</li>
        </Ul>
        <P>
          To exercise these rights, email {SUPPORT_EMAIL}. You may also complain to the UK
          Information Commissioner’s Office (ICO) at{' '}
          <a
            href="https://ico.org.uk/"
            className="text-foreground underline-offset-4 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            ico.org.uk
          </a>
          .
        </P>
      </section>

      <section className="space-y-3">
        <H2>8. Children’s and student data</H2>
        <P>
          {PRODUCT_NAME} is designed for classroom use. Student accounts are created and managed by
          teachers. Teachers and schools are responsible for ensuring they have a lawful basis and
          any required parental or school consents before submitting children’s personal data.
          Please do not use the service to collect unnecessary sensitive information about
          students.
        </P>
      </section>

      <section className="space-y-3">
        <H2>9. Security</H2>
        <P>
          We use industry-standard measures appropriate to a cloud-hosted education app (encrypted
          transport, hashed passwords, session controls, infrastructure provided by Cloudflare). No
          method of transmission or storage is perfectly secure; please use strong passwords and
          protect account access.
        </P>
      </section>

      <section className="space-y-3">
        <H2>10. Changes</H2>
        <P>
          We may update this Privacy Policy from time to time. The effective date at the top of this
          page will change when we do. Continued use of the service after an update means you
          acknowledge the revised policy.
        </P>
      </section>

      <section className="space-y-3">
        <H2>11. Contact</H2>
        <P>
          {OPERATOR_NAME}
          <br />
          {OPERATOR_ADDRESS}
          <br />
          Email:{' '}
          <a href={SUPPORT_MAILTO} className="text-foreground underline-offset-4 hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </P>
      </section>
    </LegalShell>
  )
}
