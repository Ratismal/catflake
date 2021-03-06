const BigInt = require('big-integer');

/**
 * @module catflake
 */

// helper function to get the max value of a given number of bits
function getBits(bits) {
  return (2 ** bits) - 1;
}

// helper function to sleep for a specified duration
function sleep(time = 1) {
  return new Promise(res => {
    setTimeout(res, time);
  });
}

/**
 * A BigInteger object
 * @typedef {object} BigInteger
 * @see https://www.npmjs.com/package/big-integer
 */

/**
  * A container for a deconstructed snowflake
  * @typedef {object} DeconstructedSnowflake
  * @property {BigInteger} timestamp - The timestamp of a snowflake
  * @property {BigInteger} workerId - The worker ID associated to the snowflake
  * @property {BigInteger} processId - The process ID associated to the snowflake
  * @property {BigInteger} increment - The increment of the snowflake
  */

/**
 * Class representing a snowflake factory
 */
class Catflake {
  /**
   * Create a Catflake factory
   * @param {object} options - The options to configure Catflake with
   * @param {number} [options.epoch=1420070400000] - The epoch to subtract from the timestamp
   * @param {number} [options.incrementBits=12] - The max number of bits that the increment can span
   * @param {number} [options.workerBits=12] - The max number of bits that the workerId can span
   * @param {number} [options.processBits=12] - The max number of bits that the processId can span
   * @param {number} [options.processId=12] - The process ID to generate snowflakes for
   * @param {number} [options.workerBits=12] - The worker ID to generate snowflakes for
   * @param {boolean} [options.async=false] - When true, generate snowflakes asyncronously (eliminates duplicates, but slightly slower)
   * @param {boolean} [options.stringify=true] - When true, returns a string for snowflakes. Otherwise, returns a BigInteger object
   */
  constructor(options = {}) {
    this.options = {
      epoch: 1420070400000,
      incrementBits: 12,
      processBits: 5,
      workerBits: 5,
      processId: 0,
      workerId: 0,
      async: false,
      stringify: true,
      ...options
    };

    // an object containing mutable (unfrozen) properties
    this.mutable = {
      increment: BigInt.zero.subtract(1),
      lastTimestamp: Date.now(),
      locks: [],
      locked: false
    };

    if (this.options.incrementBits + this.options.processBits + this.options.workerBits !== 22) {
      throw new Error('incrementBits, processBits, and workerBits must add up to 22.')
    }

    // ensure that ids conform to the number of bits
    this.options.processId = this.options.processId % (2 ** this.options.processBits);
    this.options.workerId = this.options.workerId % (2 ** this.options.workerBits);
    // check if NaN
    if (isNaN(this.options.processId)) this.options.processId = 0;
    if (isNaN(this.options.workerId)) this.options.workerId = 0;

    // store the maximum increment bound
    this.maxIncrement = 2 ** this.options.incrementBits;

    // calculate the shifted worker/process ids for later reference
    this.workerId = BigInt(this.options.workerId).shiftLeft(this.options.incrementBits + this.options.processBits);
    this.processId = BigInt(this.options.processId).shiftLeft(this.options.incrementBits);

    // freeze options and this object, to prevent tampering
    Object.freeze(this.options);
    Object.freeze(this);
  }

  get increment() {
    return this.mutable.increment = this.mutable.increment.next().mod(this.maxIncrement);
  }

  /**
   * Generates a snowflake
   * @returns {(string|BigInteger|Promise<string|BigInteger>)}
   */
  generate() {
    if (this.options.async) {
      return this._generateAsync();
    } else return this._generate();
  }

  _generate(date, increment = null) {
    // 0000000000000000000000000000000000000000000000000000000000000000
    // aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000000000000000
    let flake = BigInt(date || Date.now()).minus(this.options.epoch).shiftLeft(22)
      // aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbb00000000000000000
      .add(this.workerId)
      // aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbccccc000000000000
      .add(this.processId)
      // aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbcccccdddddddddddd
      .add(increment || this.increment);

    if (this.options.stringify) flake = flake.toString();

    return flake;
  }

  _lock() {
    if (this.mutable.locked) {
      return new Promise(res => {
        this.mutable.locks.push(res);
      });
    } else {
      this.mutable.locked = true;
    }
  }

  _unlock() {
    if (this.mutable.locks.length > 0) {
      this.mutable.locks.shift()();
    } else this.mutable.locked = false;
  }

  async _generateAsync() {
    let lock = this._lock();
    if (lock) await lock;
    let now = Date.now();
    // check if increment should be reset
    if (this.mutable.lastTimestamp !== now) {
      // last timestamp didnt match, reset increment
      this.mutable.lastTimestamp = now;
      this.mutable.increment = BigInt.zero;
    } else {
      // last timestamp matched, increase increment
      this.mutable.increment = this.mutable.increment.next();
      // check if increment exceeds max bounds
      if (this.mutable.increment.greaterOrEquals(this.maxIncrement)) {
        // sleep for 2ms - 1ms has a risk of timestamp not incrementing for some reason?
        await sleep(2);
        // reset increment
        now = this.mutable.lastTimestamp = Date.now();
        this.mutable.increment = BigInt.zero;
      }
    }

    // generate a snowflake with the new increment
    let flake = this._generate(now, this.mutable.increment);
    this._unlock();
    return flake;
  }

  /**
   * Deconstructs a snowflake
   * @param {(string|number|BigInteger)} snowflake - The snowflake to deconstruct
   * @returns {DeconstructedSnowflake}
   */
  deconstruct(snowflake) {
    // turn snowflake into a bigint
    let flake = BigInt(snowflake);
    // shift right, and add epoch to obtain timestamp
    let timestamp = flake.shiftRight(22).add(this.options.epoch);

    //obtain workerId
    let wBitShift = this.options.incrementBits + this.options.processBits;
    let workerId = flake.and(
      BigInt(getBits(this.options.workerBits)).shiftLeft(wBitShift)
    ).shiftRight(wBitShift);

    // obtain processId
    let processId = flake.and(
      BigInt(getBits(this.options.processBits)).shiftLeft(this.options.incrementBits)
    ).shiftRight(this.options.incrementBits);

    // obtain increment
    let increment = flake.and(getBits(this.options.incrementBits));

    return {
      timestamp,
      workerId,
      processId,
      increment
    };
  }
}

module.exports = Catflake;