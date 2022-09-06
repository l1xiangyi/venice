/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type UserRequestPreferences = {
  /**
   * The dateformat of the user.This attribute is just a place holder and has no impact on any other API services.
   */
  dateFormat?: string;
  /**
   * The timezone of the user. This attribute is just a place holder and has no impact on any other API services.
   */
  timeZone?: string;
  /**
   * The currency of the user. This currency will be respected while providing the response for derived API services.<br><b>Applicable Values</b><br>
   */
  currency?: 'USD' | 'AUD' | 'BRL' | 'CAD' | 'EUR' | 'GBP' | 'HKD' | 'IDR' | 'INR' | 'JPY' | 'NZD' | 'SGD' | 'ZAR' | 'CNY' | 'VND' | 'MYR' | 'CHF' | 'AED' | 'AFA' | 'ALL' | 'AMD' | 'ANG' | 'AOA' | 'ARS' | 'AWG' | 'AZM' | 'BAM' | 'BBD' | 'BDT' | 'BGL' | 'BHD' | 'BIF' | 'BMD' | 'BND' | 'BOB' | 'BSD' | 'BTN' | 'BWP' | 'BYR' | 'BZD' | 'CDF' | 'CLP' | 'COP' | 'CRC' | 'CUP' | 'CVE' | 'CYP' | 'CZK' | 'DJF' | 'DKK' | 'DOP' | 'DZD' | 'EEK' | 'EGP' | 'ERN' | 'ETB' | 'FJD' | 'FKP' | 'GEL' | 'GGP' | 'GHC' | 'GIP' | 'GMD' | 'GNF' | 'GTQ' | 'GYD' | 'HNL' | 'HRK' | 'HTG' | 'HUF' | 'ILS' | 'IMP' | 'IQD' | 'IRR' | 'ISK' | 'JEP' | 'JMD' | 'JOD' | 'KES' | 'KGS' | 'KHR' | 'KMF' | 'KPW' | 'KRW' | 'KWD' | 'KYD' | 'KZT' | 'LAK' | 'LBP' | 'LKR' | 'LRD' | 'LSL' | 'LTL' | 'LVL' | 'LYD' | 'MAD' | 'MDL' | 'MGF' | 'MKD' | 'MMK' | 'MNT' | 'MOP' | 'MRO' | 'MTL' | 'MUR' | 'MVR' | 'MWK' | 'MXN' | 'MZM' | 'NAD' | 'NGN' | 'NIO' | 'NOK' | 'NPR' | 'OMR' | 'PAB' | 'PEN' | 'PGK' | 'PHP' | 'PKR' | 'PLN' | 'PYG' | 'QAR' | 'ROL' | 'RUR' | 'RWF' | 'SAR' | 'SBD' | 'SCR' | 'SDD' | 'SEK' | 'SHP' | 'SIT' | 'SKK' | 'SLL' | 'SOS' | 'SPL' | 'SRG' | 'STD' | 'SVC' | 'SYP' | 'SZL' | 'THB' | 'TJR' | 'TMM' | 'TND' | 'TOP' | 'TRL' | 'TTD' | 'TVD' | 'TWD' | 'TZS' | 'UAH' | 'UGX' | 'UYU' | 'UZS' | 'VEB' | 'VUV' | 'WST' | 'XAF' | 'XAG' | 'XAU' | 'XCD' | 'XDR' | 'XOF' | 'XPD' | 'XPF' | 'XPT' | 'YER' | 'YUM' | 'ZMK' | 'ZWD' | 'ADP' | 'ATS' | 'BEF' | 'BUK' | 'CSD' | 'CSK' | 'DDM' | 'DEM' | 'ECS' | 'ESP' | 'FIM' | 'GRD' | 'GWP' | 'IEP' | 'ITL' | 'LUF' | 'MLF' | 'NLG' | 'PTE' | 'SUR' | 'TPE' | 'UAK' | 'XBA' | 'XBB' | 'XBC' | 'XBD' | 'XEU' | 'XFO' | 'XFU' | 'XGF' | 'XMK' | 'XRM' | 'XTS' | 'YDD' | 'YUD' | 'ZRN' | 'TJS' | 'RON' | 'BGN' | 'BTC' | 'XBT' | 'CNH' | 'RUB' | 'TRY' | 'GHS' | 'TMT' | 'ZMW' | 'VEF' | 'SSP' | 'ALK';
  /**
   * The locale of the user. This locale will be considered for localization features like providing the provider information in the supported locale or providing category names in the transaction related services.<br><b>Applicable Values</b><br>
   */
  locale?: 'en_US' | 'en_AN' | 'en_GB' | 'en_AU' | 'en_BE' | 'zh_CN' | 'en_IN' | 'en_CA' | 'en_ES' | 'en_NZ' | 'en_IE' | 'en_IL' | 'en_FR' | 'en_AE' | 'en_FJ' | 'en_GU' | 'en_HK' | 'en_IT' | 'en_JP' | 'en_KH' | 'en_KP' | 'en_KR' | 'en_MY' | 'en_PG' | 'en_PH' | 'en_SB' | 'en_SG' | 'en_TH' | 'en_TO' | 'en_VN' | 'en_VU' | 'en_WS' | 'es_ES' | 'fr_CA' | 'fr_FR' | 'nl_AN' | 'en_CH' | 'en_ZA' | 'en_CN' | 'en_FI' | 'en_AT' | 'de_AT' | 'en_DE' | 'de_DE' | 'de_RU' | 'en_ID' | 'en_MX' | 'es_MX' | 'en_PT' | 'en_SE' | 'en_GLOBAL' | 'pt_BR' | 'en_DK' | 'en_BR' | 'en_BM' | 'en_CK' | 'en_CO' | 'en_JE' | 'en_BG' | 'en_BW' | 'en_MW' | 'en_KE' | 'en_SZ' | 'en_ZW' | 'en_NL' | 'nl_NL';
};

