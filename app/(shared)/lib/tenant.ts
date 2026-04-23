export type Tenant = 'CRO' | 'CDMO' | 'BIOTECH_CRO' | 'BIOTECH_CDMO'

export interface TenantConfig {
  orgType: string
  orgLabel: string
  orgLabelPlural: string
  counterpartyLabel: string
  serviceLabel: string
  platformName: string
  appSide: 'buy' | 'sell'
}

export const TENANT_MAP: Record<string, Tenant> = {
  'crorfp.com':       'CRO',
  'cdmorfp.com':      'CDMO',
  'sourcemycro.com':  'BIOTECH_CRO',
  'sourcemycdmo.com': 'BIOTECH_CDMO',
  'localhost:3000':   'CRO',  // default for local dev
}

export const TENANT_CONFIG: Record<Tenant, TenantConfig> = {
  CRO: {
    orgType:            'CRO',
    orgLabel:           'CRO',
    orgLabelPlural:     'CROs',
    counterpartyLabel:  'Sponsor',
    serviceLabel:       'Study',
    platformName:       'CRORFP',
    appSide:            'sell',
  },
  CDMO: {
    orgType:            'CDMO',
    orgLabel:           'CDMO',
    orgLabelPlural:     'CDMOs',
    counterpartyLabel:  'Client',
    serviceLabel:       'Manufacturing Run',
    platformName:       'CDMORFP',
    appSide:            'sell',
  },
  BIOTECH_CRO: {
    orgType:            'BIOTECH',
    orgLabel:           'Sponsor',
    orgLabelPlural:     'Sponsors',
    counterpartyLabel:  'CRO',
    serviceLabel:       'Study',
    platformName:       'SourceMyCRO',
    appSide:            'buy',
  },
  BIOTECH_CDMO: {
    orgType:            'BIOTECH',
    orgLabel:           'Sponsor',
    orgLabelPlural:     'Sponsors',
    counterpartyLabel:  'CDMO',
    serviceLabel:       'Manufacturing Run',
    platformName:       'SourceMyCDMO',
    appSide:            'buy',
  },
}
