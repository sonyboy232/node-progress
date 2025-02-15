/*!
 * node-progress
 * Copyright(c) 2011 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Expose `ProgressBar`.
 */

exports = module.exports = ProgressBar;

/**
 * Initialize a `ProgressBar` with the given `fmt` string and `options` or
 * `total`.
 *
 * Options:
 *
 *   - `curr` current completed index
 *   - `total` total number of ticks to complete
 *   - `width` the displayed width of the progress bar defaulting to total
 *   - `stream` the output stream defaulting to stderr
 *   - `head` head character defaulting to complete character
 *   - `complete` completion character defaulting to "="
 *   - `incomplete` incomplete character defaulting to "-"
 *   - `renderThrottle` minimum time between updates in milliseconds defaulting to 16
 *   - `callback` optional function to call when the progress bar completes
 *   - `callbackOnTerminate` will run the callback function upon termination
 *   - `clear` will clear the progress bar upon termination
 *
 * Tokens:
 *
 *   - `:bar` the progress bar itself
 *   - `:current` current tick number
 *   - `:total` total ticks
 *   - `:elapsed` time elapsed in seconds
 *   - `:percent` completion percentage
 *   - `:eta` eta in seconds
 *   - `:rate` rate of ticks per second
 *
 * @param {string} fmt
 * @param {object|number} options or total
 * @api public
 */

function ProgressBar(fmt, options) {
  this.stream = options.stream || process.stderr;

  if (typeof(options) == 'number') {
    var total = options;
    options = {};
    options.total = total;
  } else {
    options = options || {};
    if ('string' != typeof fmt) throw new Error('format required');
    if ('number' != typeof options.total) throw new Error('total required');
  }

  this.curr = options.curr || 0;
  this.total = options.total;
  this.width = options.width || this.total;
  this.clearOnTerminate = options.clear;
  this.callbackOnTerminate = options.callbackOnTerminate;
  this.cleared=true;
  this.chars = {
    complete   : options.complete || '=',
    incomplete : options.incomplete || '-',
    head       : options.head || (options.complete || '=')
  };
  this.renderThrottle = options.renderThrottle !== 0 ? (options.renderThrottle || 16) : 0;
  this.lastRender = -Infinity;
  this.callback = options.callback || function () {};
  this.tokens = {};
  this.tokenData = {
    current: {raw: 0, formatted: '0'},
    total: {raw: 0, formatted: '0'},
    elapsed: {raw: 0, formatted: '0'},
    eta: {raw: 0, formatted: '0'},
    percent: {raw: 0, formatted: '0'},
    rate: {raw: 0, formatted: '0'},
    bar: {raw: '', formatted: ''},
  };
  this.lastDraw = [];
  this.eol = require('os').EOL;
  if(fmt.indexOf(this.eol)){
    this.fmt = fmt.split(this.eol);
  }else{
    this.fmt = [fmt];
  }
}

/**
 * "tick" the progress bar with optional `len` and optional `tokens`.
 *
 * @param {number|object} len or tokens
 * @param {object} tokens
 * @api public
 */

ProgressBar.prototype.tick = function(len, tokens){
  if (len !== 0)
    len = len || 1;

  // swap tokens
  if ('object' == typeof len) tokens = len, len = 1;
  if (tokens) this.tokens = tokens;

  // start time for eta
  if (0 == this.curr) this.start = new Date();

  this.curr += len;

  // try to render
  this.render();

  // progress complete
  if (this.curr >= this.total) {
    this.render(undefined, true);
    this.complete = true;
    this.terminate();
    if(!this.callbackOnTerminate){
      this.callback(this);
    }
    return;
  }
};

/**
 * Method to render the progress bar with optional `tokens` to place in the
 * progress bar's `fmt` field.
 *
 * @param {object} tokens
 * @api public
 */

ProgressBar.prototype.render = function (tokens, force) {
  force = force !== undefined ? force : false;
  if (tokens) this.tokens = tokens;

  if (!this.stream.isTTY) return;

  var now = Date.now();
  var delta = now - this.lastRender;
  if (!force && (delta < this.renderThrottle)) {
    return;
  } else {
    this.lastRender = now;
  }

  var ratio = this.curr / this.total;
  ratio = Math.min(Math.max(ratio, 0), 1);

  this.tokenData.current.raw = this.curr;
  this.tokenData.current.formatted = this.curr.toString();

  this.tokenData.total.raw = this.total;
  this.tokenData.total.formatted = this.total.toString();

  this.tokenData.percent.raw = Math.floor(ratio * 100);
  var incomplete, complete, completeLength;
  this.tokenData.elapsed.raw = (new Date()).getTime() - this.start.getTime();
  this.tokenData.eta.raw = (this.tokenData.percent.raw == 100) ? 0 : this.tokenData.elapsed.raw * (this.total / this.curr - 1);
  this.tokenData.rate.raw = this.curr / (this.tokenData.elapsed.raw / 1000);

  this.tokenData.elapsed.formatted = this.humanTime(this.tokenData.elapsed.raw);
  this.tokenData.eta.formatted = this.humanTime(this.tokenData.eta.raw);
  this.tokenData.percent.formatted = this.tokenData.percent.raw.toFixed(0) + '%';
  this.tokenData.rate.formatted = (!this.tokenData.rate.raw || !isFinite(this.tokenData.rate.raw) ? 0 : this.tokenData.rate.raw).toFixed(2);

  var lines=[];
  for(var line of this.fmt){
    /* populate the bar template with percentages and timestamps */
    var lineStr = line
      .replace(':current', this.tokenData.current.formatted)
      .replace(':total', this.tokenData.total.formatted)
      .replace(':elapsed', this.tokenData.elapsed.formatted)
      .replace(':eta', this.tokenData.eta.formatted)
      .replace(':percent', this.tokenData.percent.formatted)
      .replace(':rate', this.tokenData.rate.formatted);
    if(line.indexOf(':bar') > -1){
      /* compute the available space (non-zero) for the bar */
      var availableSpace = Math.max(0, this.stream.columns - lineStr.replace(':bar', '').length);
      if(availableSpace && process.platform === 'win32'){
        availableSpace = availableSpace - 1;
      }

      var width = Math.min(this.width, availableSpace);

      /* TODO: the following assumes the user has one ':bar' token */
      completeLength = Math.round(width * ratio);
      complete = Array(Math.max(0, completeLength + 1)).join(this.chars.complete);
      incomplete = Array(Math.max(0, width - completeLength + 1)).join(this.chars.incomplete);

      /* add head to the complete string */
      if(completeLength > 0)
        complete = complete.slice(0, -1) + this.chars.head;

      /* fill in the actual progress bar */
      this.tokenData.bar.raw = complete + incomplete;
      this.tokenData.bar.formatted = this.tokenData.bar.raw;
      lineStr = lineStr.replace(':bar', this.tokenData.bar.formatted);
    }
    /* replace the extra tokens */
    if (this.tokens) for (var key in this.tokens) lineStr = lineStr.replace(':' + key, this.tokens[key]);
    lines.push(lineStr);
  }

  if(force || this.lastDraw.length != lines.length || !this.lastDraw.every((value, index) => value === lines[index])){
    this.clear();
    this.lastDraw = lines;
    this.redraw();
  }
};

ProgressBar.prototype.lastTokenData = function(){
  return Object.assign({},this.tokens,this.tokenData);
};

/**
 * re-display the progress bar with its lastDraw
 *
 * @api public
 */
ProgressBar.prototype.redraw = function(){
  this.clear();
  let numLines = this.lastDraw.length;
  for(var x=0; x<numLines; x++){
    this.stream.write(this.lastDraw[x]+(x+1 < numLines ? this.eol : ''));
  }
  this.cleared=false;
};

/**
 * "update" the progress bar to represent an exact percentage.
 * The ratio (between 0 and 1) specified will be multiplied by `total` and
 * floored, representing the closest available "tick." For example, if a
 * progress bar has a length of 3 and `update(0.5)` is called, the progress
 * will be set to 1.
 *
 * A ratio of 0.5 will attempt to set the progress to halfway.
 *
 * @param {number} ratio The ratio (between 0 and 1 inclusive) to set the
 *   overall completion to.
 * @api public
 */

ProgressBar.prototype.update = function (ratio, tokens) {
  var goal = Math.floor(ratio * this.total);
  var delta = goal - this.curr;

  this.tick(delta, tokens);
};

/**
 * "interrupt" the progress bar and write a message above it.
 * @param {string} message The message to write.
 * @api public
 */

ProgressBar.prototype.interrupt = function (message) {
  // clear the current output
  this.clear();

  // write the message text
  this.stream.write(message+this.eol);
  // re-display the progress bar with its lastDraw
  this.redraw();
};

/**
 * Clear the progress bar from the screen
 *
 * @api public
 */
ProgressBar.prototype.clear = function () {
  if(!this.cleared){
    this.stream.moveCursor(0, ((this.lastDraw.length-1) * -1));
    this.stream.clearScreenDown();
    this.stream.cursorTo(0);
    this.stream.clearLine(1);
    this.cleared=true;
  }
};

/**
 * Terminates a progress bar.
 *
 * @api public
 */

ProgressBar.prototype.terminate = function () {
  if (this.clearOnTerminate) {
    this.clear();
  } else {
    this.stream.write(this.eol);
    this.cleared=true;
  }
  if(this.callbackOnTerminate){
    this.callback(this);
  }
};

ProgressBar.prototype.humanTime = function(ms) {
  if(!isFinite(ms)) return 0+' ms';
  if (ms < 0) ms = -ms;
  if(ms<1000) return parseInt(ms)+' ms';
  const time = {
    day: Math.floor(ms / 86400000),
    hour: Math.floor(ms / 3600000) % 24,
    minute: Math.floor(ms / 60000) % 60,
    sec: Math.floor(ms / 1000) % 60
  };
  return Object.entries(time)
    .filter(val => val[1] !== 0)
    .map(val => {
      //if(val[0] !== 'sec') {
        return val[1] + ' ' + (val[1] !== 1 ? val[0] + 's' : val[0]);
      //} else {
      //  return val[1] + ' sec';
      //}
    })
    .join(' ');
};
