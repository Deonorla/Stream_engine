'use strict';

const { expect } = require('chai');
const {
  buildPropertyMetadata,
  validatePropertyMetadata,
} = require('../services/propertyMetadataService');
const { extractYieldRate } = require('../services/assetScreener');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEstatePayload(overrides = {}) {
  return {
    listPrice: 500000,
    address: {
      street: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    },
    beds: 3,
    baths: 2,
    sqft: 1800,
    yieldParameters: {
      yieldTargetPct: 7.5,
      monthlyRentalIncome: 3000,
    },
    ...overrides,
  };
}

function makeLandPayload(overrides = {}) {
  return {
    listPrice: 200000,
    lotSizeAcres: 5.2,
    address: {
      street: '456 Ranch Rd',
      city: 'Dripping Springs',
      state: 'TX',
      zip: '78620',
    },
    yieldParameters: {
      yieldTargetPct: 4.0,
      annualLandLeaseIncome: 12000,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Task 14.1 — buildPropertyMetadata (Estate)
// ---------------------------------------------------------------------------

describe('buildPropertyMetadata — Estate', function () {
  it('complete Estate payload produces correct schema fields', function () {
    const result = buildPropertyMetadata({
      propertyType: 'ESTATE',
      formPayload: makeEstatePayload(),
    });

    expect(result.schemaVersion).to.equal(3);
    expect(result.propertyType).to.equal('ESTATE');
    expect(result.name).to.be.a('string').and.not.empty;
    expect(result.yieldParameters).to.be.an('object');
    expect(result.yieldParameters).to.have.property('yieldTargetPct');
    expect(result.yieldParameters).to.have.property('monthlyRentalIncome');
    expect(result.yieldParameters).to.have.property('annualizedRentalIncome');
  });

  it('minimal payload (listPrice + address only) does not throw and sets monthlyYieldTarget', function () {
    let result;
    expect(() => {
      result = buildPropertyMetadata({
        propertyType: 'ESTATE',
        formPayload: {
          listPrice: 300000,
          address: {
            street: '1 Oak Ave',
            city: 'Dallas',
            state: 'TX',
            zip: '75201',
          },
        },
      });
    }).to.not.throw();

    // monthlyYieldTarget is set (may be undefined when no rental income provided, but field exists)
    expect(result).to.have.property('monthlyYieldTarget');
  });

  it('string numeric inputs are parsed to finite numbers with no NaN in result', function () {
    const result = buildPropertyMetadata({
      propertyType: 'ESTATE',
      formPayload: makeEstatePayload({
        listPrice: '450000',
        beds: '4',
        baths: '2',
        sqft: '2000',
        yieldParameters: {
          yieldTargetPct: '8.0',
          monthlyRentalIncome: '3500',
        },
      }),
    });

    // Spot-check parsed numbers
    expect(result.listPrice).to.be.a('number').and.satisfy(Number.isFinite);
    expect(result.beds).to.be.a('number').and.satisfy(Number.isFinite);
    expect(result.sqft).to.be.a('number').and.satisfy(Number.isFinite);
    expect(result.yieldParameters.yieldTargetPct).to.be.a('number').and.satisfy(Number.isFinite);
    expect(result.yieldParameters.monthlyRentalIncome).to.be.a('number').and.satisfy(Number.isFinite);
    expect(result.yieldParameters.annualizedRentalIncome).to.be.a('number').and.satisfy(Number.isFinite);

    // Ensure no NaN anywhere in the flat result
    for (const [key, val] of Object.entries(result)) {
      if (typeof val === 'number') {
        expect(val, `field "${key}" should not be NaN`).to.satisfy((n) => !Number.isNaN(n));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Task 14.2 — buildPropertyMetadata (Land)
// ---------------------------------------------------------------------------

describe('buildPropertyMetadata — Land', function () {
  it('complete Land payload produces correct schema fields', function () {
    const result = buildPropertyMetadata({
      propertyType: 'LAND',
      formPayload: makeLandPayload(),
    });

    expect(result.schemaVersion).to.equal(3);
    expect(result.propertyType).to.equal('LAND');
    expect(result.name).to.be.a('string').and.include('acres at');
    expect(result.yieldParameters).to.be.an('object');
    expect(result.yieldParameters).to.have.property('annualLandLeaseIncome');
    expect(result.yieldParameters.annualLandLeaseIncome).to.equal(12000);
  });
});

// ---------------------------------------------------------------------------
// Task 14.3 — validatePropertyMetadata
// ---------------------------------------------------------------------------

describe('validatePropertyMetadata', function () {
  it('valid Estate metadata returns { valid: true, errors: [] }', function () {
    const metadata = buildPropertyMetadata({
      propertyType: 'ESTATE',
      formPayload: makeEstatePayload(),
    });
    let result;
    expect(() => { result = validatePropertyMetadata(metadata); }).to.not.throw();
    expect(result.valid).to.equal(true);
    expect(result.errors).to.deep.equal([]);
  });

  it('null input returns { valid: false, errors: [...] } with at least one error', function () {
    let result;
    expect(() => { result = validatePropertyMetadata(null); }).to.not.throw();
    expect(result.valid).to.equal(false);
    expect(result.errors).to.be.an('array').with.length.greaterThan(0);
  });

  it('undefined input returns { valid: false, errors: [...] } with at least one error', function () {
    let result;
    expect(() => { result = validatePropertyMetadata(undefined); }).to.not.throw();
    expect(result.valid).to.equal(false);
    expect(result.errors).to.be.an('array').with.length.greaterThan(0);
  });

  it('missing propertyType produces a specific error message', function () {
    const metadata = buildPropertyMetadata({
      propertyType: 'ESTATE',
      formPayload: makeEstatePayload(),
    });
    delete metadata.propertyType;
    let result;
    expect(() => { result = validatePropertyMetadata(metadata); }).to.not.throw();
    expect(result.valid).to.equal(false);
    expect(result.errors.some((e) => /propertyType/i.test(e))).to.equal(true);
  });

  it('missing listPrice produces a specific error message', function () {
    const metadata = buildPropertyMetadata({
      propertyType: 'ESTATE',
      formPayload: makeEstatePayload(),
    });
    delete metadata.listPrice;
    let result;
    expect(() => { result = validatePropertyMetadata(metadata); }).to.not.throw();
    expect(result.valid).to.equal(false);
    expect(result.errors.some((e) => /listPrice/i.test(e))).to.equal(true);
  });

  it('missing address.street produces a specific error message', function () {
    const metadata = buildPropertyMetadata({
      propertyType: 'ESTATE',
      formPayload: makeEstatePayload(),
    });
    metadata.address.street = '';
    let result;
    expect(() => { result = validatePropertyMetadata(metadata); }).to.not.throw();
    expect(result.valid).to.equal(false);
    expect(result.errors.some((e) => /address\.street/i.test(e))).to.equal(true);
  });

  it('missing address.city produces a specific error message', function () {
    const metadata = buildPropertyMetadata({
      propertyType: 'ESTATE',
      formPayload: makeEstatePayload(),
    });
    metadata.address.city = '';
    let result;
    expect(() => { result = validatePropertyMetadata(metadata); }).to.not.throw();
    expect(result.valid).to.equal(false);
    expect(result.errors.some((e) => /address\.city/i.test(e))).to.equal(true);
  });

  it('missing address.state produces a specific error message', function () {
    const metadata = buildPropertyMetadata({
      propertyType: 'ESTATE',
      formPayload: makeEstatePayload(),
    });
    metadata.address.state = '';
    let result;
    expect(() => { result = validatePropertyMetadata(metadata); }).to.not.throw();
    expect(result.valid).to.equal(false);
    expect(result.errors.some((e) => /address\.state/i.test(e))).to.equal(true);
  });

  it('missing address.zip produces a specific error message', function () {
    const metadata = buildPropertyMetadata({
      propertyType: 'ESTATE',
      formPayload: makeEstatePayload(),
    });
    metadata.address.zip = '';
    let result;
    expect(() => { result = validatePropertyMetadata(metadata); }).to.not.throw();
    expect(result.valid).to.equal(false);
    expect(result.errors.some((e) => /address\.zip/i.test(e))).to.equal(true);
  });

  it('never throws for any input', function () {
    const inputs = [null, undefined, 42, 'string', [], {}, { propertyType: 'ESTATE' }];
    for (const input of inputs) {
      expect(() => validatePropertyMetadata(input)).to.not.throw();
    }
  });
});

// ---------------------------------------------------------------------------
// Task 14.4 — extractYieldRate (updated)
// ---------------------------------------------------------------------------

describe('extractYieldRate', function () {
  it('asset with yieldParameters.yieldTargetPct: 8.5 returns 8.5', function () {
    const asset = {
      publicMetadata: {
        listPrice: 500000,
        yieldParameters: { yieldTargetPct: 8.5 },
      },
    };
    expect(extractYieldRate(asset)).to.equal(8.5);
  });

  it('asset with monthlyRentalIncome and listPrice returns annualized rate', function () {
    // (3500 * 12 / 500000) * 100 = 8.4
    const asset = {
      publicMetadata: {
        listPrice: 500000,
        yieldParameters: { monthlyRentalIncome: 3500 },
      },
    };
    const rate = extractYieldRate(asset);
    expect(rate).to.be.closeTo(8.4, 0.01);
  });

  it('asset with annualLandLeaseIncome and listPrice returns correct rate', function () {
    // (12000 / 200000) * 100 = 6
    const asset = {
      publicMetadata: {
        listPrice: 200000,
        yieldParameters: { annualLandLeaseIncome: 12000 },
      },
    };
    const rate = extractYieldRate(asset);
    expect(rate).to.be.closeTo(6, 0.01);
  });

  it('live stream data takes priority over yieldParameters', function () {
    const asset = {
      stream: {
        totalAmount: 1000,
        durationSeconds: 3600,
        depositedAmount: 1000,
      },
      publicMetadata: {
        listPrice: 500000,
        yieldParameters: { yieldTargetPct: 1.0 },
      },
    };
    const streamRate = extractYieldRate(asset);
    // Stream-derived: (1000 / 3600) * 31536000 / 1000 * 100 = 876000%  (capped at 999)
    // Must be different from yieldTargetPct=1.0 — stream wins
    expect(streamRate).to.be.greaterThan(1.0);
  });

  it('legacy asset with only monthlyYieldTarget returns non-zero rate', function () {
    const asset = {
      publicMetadata: {
        monthlyYieldTarget: 500,
      },
    };
    expect(extractYieldRate(asset)).to.be.greaterThan(0);
  });

  it('legacy asset with only pricePerHour returns non-zero rate', function () {
    const asset = {
      publicMetadata: {
        pricePerHour: 0.1,
      },
    };
    expect(extractYieldRate(asset)).to.be.greaterThan(0);
  });
});
