# Lacag-bixinta Bahaya Shop

Checkout-kan waa adeeg gaar ah. Wuxuu ku shaqeeyaa Node.js 22.13 ama ka cusub, wuxuuna leeyahay bog iyo kayd u gaar ah. Waxa uu Stripe ka soo qaataa hal badeecad iyo qiimaheeda DKK. Bogga waxa loogu talagalay iibka badeecad la oggol yahay. Stripe wuxuu MobilePay ka mamnuucaa xawaaladaha hoos yimaada MCC 4829. Xaqiiji in Stripe uu koontada iibka u oggolaaday MobilePay. [Shuruudaha MobilePay](https://docs.stripe.com/payments/mobilepay#eligibility-and-availability)

## Tijaabada kombiyuutarka

1. Gal galka `checkout` oo orod `npm ci` iyo `npm test`.
2. Nuqul ka samee `.env.example` oo u bixi `.env`. Geli furaha sandbox-ka iyo aqoonsiga Price-ka badeecadda. Price-ku waa inuu yahay mid firfircoon, hal mar la bixiyo, oo qiime go'an oo DKK ah leh.
3. Ku xidh Stripe CLI sandbox-kaas oo orod amarka hoose. Geli furaha saxiixa ee uu CLI-gu kuu soo bandhigo gudaha `STRIPE_WEBHOOK_SECRET`.

   ```text
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed --forward-to http://localhost:8090/stripe/webhook
   ```

4. Orod `npm start`, fur [checkout-ka maxalliga ah](http://localhost:8090), oo dhammaystir lacag-bixin tijaabo ah. Bogga soo-noqoshadu wuxuu xaqiijinayaa lacagta marka adeeggu helo fariinta Stripe ee saxiixan.

## Diyaarinta LIVE kaddib dib-u-eegista

- Adeegga u dejiso asal HTTPS oo u gaar ah gudaha `CHECKOUT_ORIGIN`. Isticmaal kayd joogto ah, u deji jidkiisa buuxa `CHECKOUT_DATA_DIR`, oo ku socodsii hal nuqul oo adeegga ah. `checkout-payments.sqlite` wuxuu kaydiyaa aqoonsiyada Stripe, qiimaha iyo xaaladda lacag-bixinta.
- Stripe Dashboard ka samee payment method configuration gaar u ah checkout-kan, ka daar MobilePay iyo hababka kale ee aad rabto, kuna deji aqoonsiga `pmc_` gudaha `STRIPE_PAYMENT_METHOD_CONFIGURATION`. Stripe ayaa MobilePay tusaya macaamiisha u qalanta. [Hagaha Stripe Checkout iyo MobilePay](https://docs.stripe.com/payments/mobilepay/accept-a-payment.md?payment-ui=checkout)
- Ku dar webhook-ka LIVE ee `/stripe/webhook` oo u dooro saddexda dhacdo ee kor ku qoran. Geli furaha saxiixa iyo furaha LIVE ee xaddidan kaydka siraha ee martigeliyaha. Furaha Stripe wuxuu u baahan yahay akhrinta Prices iyo Products iyo qorista Checkout Sessions. Deji `STRIPE_PRICE_ID` iyo `CHECKOUT_MODE=live`. [Hagaha furayaasha Stripe](https://docs.stripe.com/keys-best-practices)
- Qaybtani waxay diiwaangelisaa xaaladda lacagta. Ka hor inta bogga macaamiisha lagu xidhin, xaqiiji badeecadda, qaabka qaadashada ama gaarsiinta, iyo sida dukaanku u maamulayo dalabka la bixiyey.
