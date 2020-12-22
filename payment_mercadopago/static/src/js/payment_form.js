odoo.define('payment_mercadopago.payment_form', function(require) {
    "use strict";

    var ajax = require('web.ajax');
    var core = require('web.core');
    var PaymentForm = require('payment.payment_form');
    var _t = core._t;
    var error_messages = {
        '205': 'El número de la tarjeta de no puede ser vacío.',
        '208': 'La fecha de vencimiento no puede esta vacío.',
        '209': 'La fecha de vencimiento no puede esta vacío.',
        '212': 'El tipo de documento no puede ser vacío.',
        '214': 'El número de documento no puede ser vacío.',
        '221': 'El titular de la tarjeta no puede ser vacío.',
        '224': 'El código de seguridad no puede ser vacío.',
        'E301': 'Número de tarjeta inválido.',
        'E302': 'Código de seguridad inválido.',
        '316': 'Titular de la tarjeta inválido.',
        '322': 'Tipo de documento inválido.',
        '324': 'Número de documento inválido.',
        '325': 'Fecha de vencimiento inválida.',
        '326': 'Fecha de vencimiento inválida.',
    }

    PaymentForm.include({

        willStart: function () {
            return this._super.apply(this, arguments).then(function () {
                return ajax.loadJS("https://secure.mlstatic.com/sdk/javascript/v1/mercadopago.js");
            })
        },

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * called when clicking on pay now or add payment event to create token for credit card/debit card.
         *
         * @private
         * @param {Event} ev
         * @param {DOMElement} checkedRadio
         * @param {Boolean} addPmEvent
         */
        _createMercadoPagoToken: function(ev, $checkedRadio, addPmEvent) {
            console.log('_createMercadoPagoToken');
            var self = this;
            if (ev.type === 'submit') {
                var button = $(ev.target).find('*[type="submit"]')[0]
            } else {
                var button = ev.target;
            }
            this.disableButton(button);
            var acquirerID = this.getAcquirerIdFromRadio($checkedRadio);
            var acquirerForm = this.$('#o_payment_add_token_acq_' + acquirerID);
            var formID = acquirerForm[0].id;

            var doSubmit = false;
            document.getElementById(formID).addEventListener('submit', getCardToken);
            getCardToken(ev);

            function getCardToken(event){
                console.log('getCardToken');
                event.preventDefault();
                if(!doSubmit){
                    let $form = document.getElementById(formID);
                    window.Mercadopago.createToken($form, setCardTokenAndPay);
                    return false;
                }
            };

            function setCardTokenAndPay(status, response) {
                console.log('setCardTokenAndPay');
                if (status == 200 || status == 201) {
                    console.log('setCardTokenAndPay 200');
                    let form = document.getElementById(formID);
                    let card = document.createElement('input');
                    card.setAttribute('name', 'token');
                    card.setAttribute('type', 'hidden');
                    card.setAttribute('value', response.id);
                    form.appendChild(card);
                    doSubmit=true;
                    // form.submit();
                    console.log('Send token');
                    if (! addPmEvent) {
                        // TODO: esto se debería poder incluir directamente en el formData y pasarlo directo
                        let save_token = document.createElement('input');
                        save_token.setAttribute('name', 'save_token');
                        save_token.setAttribute('type', 'hidden');
                        save_token.setAttribute('value', document.getElementById('save_mp').checked);
                        debugger;
                        form.appendChild(save_token);
                        debugger;
                    }
                    var inputsForm = $('input', acquirerForm);
                    var formData = self.getFormData(inputsForm);
                    self._rpc({
                        route: formData.data_set,
                        params: formData
                    }).then (function (data) {
                        if (addPmEvent) {
                            if (formData.return_url) {
                                window.location = formData.return_url;
                            } else {
                                console.log('OTP from form');
                                window.location.reload();
                            }
                        } else {
                            $checkedRadio.val(data.id);
                            self.el.submit();
                        }
                    }).guardedCatch(function (error) {
                        // if the rpc fails, pretty obvious
                        error.event.preventDefault();
                        acquirerForm.removeClass('d-none');
                        self.enableButton(button);
                        self.displayError(
                            _t('Server Error'),
                            _t("We are not able to add your payment method at the moment.") + self._parseError(error)
                        );
                    });
                } else {
                    acquirerForm.removeClass('d-none');
                    self.enableButton(button);
                    self.do_warn(_t("Error"),_t(error_messages[response.cause[0].code]));
                }
            };
        },

        /**
         * @param {Event} ev
         * @param {DOMElement} checkedRadio
         */
        _mercadoPagoOTP: function(ev, $checkedRadio, pm_token) {
            console.log('MercadoPago OTP');
            // var acquirerID = this.getAcquirerIdFromRadio($checkedRadio);
            var self = this;
            var button = ev.target;
            var form = this.el;
            var card_id = $checkedRadio.data('card_id');
            console.log('card_id: ', card_id);
            var tokenID = $checkedRadio.val();
            var cvv = document.getElementById('cc_cvc_' + tokenID).value;
            console.log('cvv: ', cvv);
            let $cvv_form = $(
                "<form>" +
                "<li>" +
                "<select id=\"cardId\" name=\"cardId\" data-checkout='cardId'>" +
                "<option value=\"" + card_id + "\">" +
                "</select>" +
                "</li>" +
                "<li id=\"cvv\">" +
                "<input type=\"text\" id=\"cvv\" data-checkout=\"securityCode\" value=\"" + cvv + "\" />" +
                "</li>" +
                "</form>");
            console.log('cvv_form');
            var acquirerID = this.getAcquirerIdFromRadio($checkedRadio);
            var acquirerForm = this.$('#o_payment_add_token_acq_' + acquirerID);
            var inputsForm = $('input', acquirerForm);
            var formData = this.getFormData(inputsForm);
            window.Mercadopago.setPublishableKey(formData.mercadopago_publishable_key);
            console.log('setPublishableKey');
            window.Mercadopago.createToken($cvv_form, function (status, response) {
                if (status == 200 || status == 201) {
                    var token = response.id;
                    console.log('cvv token: ', token);
                    // agregar token al env para que le llegue a la transaction
                    console.log('call the otp controller');
                    self._rpc({
                        route: '/payment/mercadopago/s2s/otp',
                        params: {token: token}
                    }).then (function (data) {
                        // if the server has returned true
                        console.log('return from otp controller');
                        console.log('resultado: ', data.result);
                        if (data.result) {
                            // TODO: disable button
                            // this.disableButton(button);
                            form.submit();
                        }
                    });
                }
                // TODO: manage else case
            });
        },

        // method to complete de form
        updateNewPaymentDisplayStatus: function () {
            console.log('mp_updateNewPaymentDisplayStatus');
            var $checkedRadio = this.$('input[type="radio"]:checked');

            if ($checkedRadio.length !== 1) {
                return;
            }
            if ($checkedRadio.data('provider') === 'mercadopago' && this.isNewPaymentRadio($checkedRadio)) {

                var acquirerID = this.getAcquirerIdFromRadio($checkedRadio);
                var acquirerForm = this.$('#o_payment_add_token_acq_' + acquirerID);
                var inputsForm = $('input', acquirerForm);
                var formData = this.getFormData(inputsForm);
                window.Mercadopago.setPublishableKey(formData.mercadopago_publishable_key);
                console.log('set_pub_key');
                window.Mercadopago.getIdentificationTypes();
                document.getElementById('cc_number').addEventListener('change', guessPaymentMethod);

                function guessPaymentMethod(event) {
                    console.log('guessPaymentMethod');
                    let cardnumber = document.getElementById("cc_number").value.split(" ").join("");
                    if (cardnumber.length >= 6) {
                        let bin = cardnumber.substring(0,6);
                        window.Mercadopago.getPaymentMethod({
                            "bin": bin
                        }, setPaymentMethod);
                    }
                };

                function setPaymentMethod(status, response) {
                    console.log('setPaymentMethod');
                    if (status == 200) {
                        let paymentMethod = response[0];
                        document.getElementById('paymentMethodId').value = paymentMethod.id;

                        if(paymentMethod.additional_info_needed.includes("issuer_id")){
                            getIssuers(paymentMethod.id);
                        } else {
                            getInstallments(
                                paymentMethod.id,
                                document.getElementById('transactionAmount').value
                            );
                        }
                    }
                };

                function getIssuers(paymentMethodId) {
                    console.log('getIssuers');
                    window.Mercadopago.getIssuers(
                        paymentMethodId,
                        setIssuers
                    );
                };

                function setIssuers(status, response) {
                    console.log('setIssuers');
                    if (status == 200) {
                        let issuerSelect = document.getElementById('issuer');
                        response.forEach( issuer => {
                            let opt = document.createElement('option');
                            opt.text = issuer.name;
                            opt.value = issuer.id;
                            issuerSelect.appendChild(opt);
                        });

                        getInstallments(
                            document.getElementById('paymentMethodId').value,
                            document.getElementById('transactionAmount').value,
                            issuerSelect.value
                        );
                    } else {
                        alert(`issuers method info error: ${response}`);
                    };
                };

                function getInstallments(paymentMethodId, transactionAmount, issuerId){
                    console.log('getInstallments');
                    window.Mercadopago.getInstallments({
                        "payment_method_id": paymentMethodId,
                        "amount": parseFloat(transactionAmount),
                        "issuer_id": issuerId ? parseInt(issuerId) : undefined
                    }, setInstallments);
                };

                function setInstallments(status, response){
                    console.log('setInstallments');
                    if (status == 200) {
                        document.getElementById('installments').options.length = 0;
                        response[0].payer_costs.forEach( payerCost => {
                            let opt = document.createElement('option');
                            opt.text = payerCost.recommended_message;
                            opt.value = payerCost.installments;
                            document.getElementById('installments').appendChild(opt);
                        });
                    } else {
                        alert(`installments method info error: ${response}`);
                    }
                };
            // TODO: borrar?
            // } else if ($checkedRadio.data('provider') === 'mercadopago'){
            //     console.log('isMercadopagoPayExist');
            //     // debugger;
            //     var acquirerID = this.getAcquirerIdFromRadio($checkedRadio);
            //     var card_id = $checkedRadio.data('card_id');
            //     var cvv = $('input#'+card_id).val()
            }
            // else {
            // }
            this._super.apply(this, arguments);
        },

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        isMercadoPagoToken: function(element) {
            return $(element).data('provider') === 'mercadopago';
        },

        /**
         * @override
         */
        payEvent: function (ev) {
            ev.preventDefault();
            console.log('HANDLER: payEvent');
            var $checkedRadio = this.$('input[type="radio"]:checked');
            // first we check that the user has selected a MercadoPago as s2s payment method
            if ($checkedRadio.length === 1){
                if (this.isNewPaymentRadio($checkedRadio) && $checkedRadio.data('provider') === 'mercadopago') {
                    return this._createMercadoPagoToken(ev, $checkedRadio);
                } else if (this.isMercadoPagoToken($checkedRadio)){
                    return this._mercadoPagoOTP(ev, $checkedRadio, true);
                }
            } else {
                return this._super.apply(this, arguments);
            }
        },
        /**
         * @override
         */
        addPmEvent: function (ev) {
            console.log('addPmEvent');
            ev.stopPropagation();
            ev.preventDefault();
            var $checkedRadio = this.$('input[type="radio"]:checked');

            // first we check that the user has selected a MercadoPago as add payment method
            if ($checkedRadio.length === 1 && this.isNewPaymentRadio($checkedRadio) && $checkedRadio.data('provider') === 'mercadopago') {
                return this._createMercadoPagoToken(ev, $checkedRadio, true);
            } else {
                return this._super.apply(this, arguments);
            }
        },
    });
});
