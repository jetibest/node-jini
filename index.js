// enforce 'camelCase' (from camel_case or CamelCase) for all keys, recursive
const FIRST_UPPER_CASE = /^[A-Z]/;
function normalizeKeys(obj, format)
{
	if(format === 'camelCase' || format === 'CamelCase')
	{
		if(Array.isArray(obj))
		{
			for(let i=0;i<obj.length;++i)
			{
				const v = obj[i];
				
				if(typeof v === 'object' && v !== null)
				{
					normalizeKeys(v, format);
				}
			}
			return;
		}
		
		for(const k in obj)
		{
			const v = obj[k];
			
			let new_key = k;
			
			// if using underscores, convert to CamelCase
			const keyparts = new_key.split('_');
			if(keyparts.length > 1)
			{
				new_key = keyparts.map(k => k.length > 0 ? k.charAt(0).toUpperCase() + k.slice(1) : k).join('');
			}
			
			// enforce first character of the key to be lowercase
			if(FIRST_UPPER_CASE.test(new_key) && format === 'camelCase')
			{
				new_key = new_key.charAt(0).toLowerCase() + new_key.slice(1);
			}
			
			// apply new key
			if(new_key !== null)
			{
				delete obj[k];
				obj[new_key] = v;
			}
			
			if(typeof v === 'object' && v !== null)
			{
				normalizeKeys(v, format);
			}
		}
	}
	else
	{
		throw new Error('Invalid usage. Format must be one of: "camelCase", "CamelCase".');
	}

	return obj;
}

function merge(target, source)
{
	if(source === null) return target;
	if(target === null) return source;
	
	if(Array.isArray(source))
	{
		if(!Array.isArray(target))
		{
			return source;
		}
	}
	
	for(const [key, val] of Object.entries(source))
	{
		if(val !== null && typeof val === `object`)
		{
			if(target[key] === undefined)
			{
				target[key] = new val.__proto__.constructor();
			}
			
			merge(val, target[key]);
		}
		else
		{
			target[key] = val;
		}
	}
	return target;
}

function parse(data, options)
{
	options = options || {};
	
	if(typeof data === 'object')
	{
		if(data === null)
		{
			return null;
		}
		
		data = data +''; // toString()
	}
	else if(typeof data !== 'string')
	{
		throw new Error('Argument (' + data + ') is not a string.');
	}
	
	let n = data.length;
	
	const regex_whitespace = /\s/;
	const regex_index = /^[0-9]+$/;
	const regex_number = /^[+-]?\d*(\.\d+)?$/;
	
	let ln = 1;
	let i = 0;
	function next(ctx, res)
	{
		let buffer = '';
		let buffer_first = true;
		let buffer_begin_of_statement = true;
		let buffer_skip_whitespace = true;
		let buffer_last_literal = -1;
		let buffer_is_escaped = false;
		let buffer_implicit_delim = false;
		let buffer_explicit_delim = false;
		let context_section = null;
		let context_key = null;
		
		while(i < n)
		{
			const chr = data[i];
			const isEOF = i + 1 === n;
			const isEOL = chr === '\n' || isEOF;
			const isWhitespace = regex_whitespace.test(chr) && !isEOL; // exclude newline as whitespace
			
			// console.log(i + ': ' + ctx + ' chr = ' + JSON.stringify(chr) + '');
			
			if(ctx === 'main')
			{
				if(isEOL)
				{
					// discard buffer
					
					buffer = '';
					buffer_begin_of_statement = true;
					buffer_skip_whitespace = true;
					buffer_is_escaped = false;
					++i;
				}
				else if(chr === '{' && !buffer_is_escaped && buffer_begin_of_statement)
				{
					++i; // skip over '{', since we are already in the 'main' context)
					
					// this is only possible if res is still null
					let value = next('main', null);
					
					if(context_section === null || context_section.length === 0)
					{
						res = merge(res, value);
					}
					else
					{
						if(res === null) res = {};
						
						// initialize all section keys to an empty object, if not exists yet
						let tmp = res;
						for(let i=0;i<context_section.length-1;++i)
						{
							let new_key = context_section[i];
							tmp = tmp[new_key] = tmp[new_key] || {};
						}
						
						let new_key = context_section[context_section.length - 1];
						tmp[new_key] = merge(tmp[new_key], value);
					}
				}
				else if(chr === '}' && !buffer_is_escaped)
				{
					// end of object
					if(res === null) res = {};
					
					++i;
					
					return res;
				}
				else if(chr === '(' && !buffer_is_escaped && buffer_begin_of_statement)
				{
					// () is allowed to be defined in an object, to transform it into an array
					
					++i;
					
					// this is only possible if res is still null
					let array = next('array', null);
					
					if(context_section === null || context_section.length === 0)
					{
						res = merge(res, array);
					}
					else
					{
						if(res === null) res = {};
						
						// initialize all section keys to an empty object, if not exists yet
						let tmp = res;
						for(let i=0;i<context_section.length-1;++i)
						{
							let new_key = context_section[i];
							tmp = tmp[new_key] = tmp[new_key] || {};
						}
						
						let new_key = context_section[context_section.length - 1];
						tmp[new_key] = merge(tmp[new_key], array);
					}
				}
				else if(chr === '[' && !buffer_is_escaped && buffer_begin_of_statement)
				{
					// start of section
					let new_section = next('section', null);
					
					// FEATURE{section.relativeNesting}
					if(new_section.length > 0 && new_section[0] === null)
					{
						context_section = context_section.concat(new_section.slice(1));
					}
					else
					{
						context_section = new_section;
					}
					
					if(res === null) res = {};
					
					// initialize all section keys to an empty object, if not exists yet
					let tmp = res;
					for(let i=0;i<context_section.length;++i)
					{
						let new_key = context_section[i];
						tmp = tmp[new_key] = tmp[new_key] || {};
					}
					
					buffer = '';
					buffer_first = false;
					buffer_begin_of_statement = true;
					buffer_skip_whitespace = true;
				}
				else if((chr === '#' || chr === ';') && !buffer_is_escaped)
				{
					// start of comment, discard the rest of the line
					++i;
					let comment = next('comment', null);
					
					// discard the parsed comment
				}
				
				// handle 'key' which is integrated in the 'main' context:
				else if((chr === '=' || chr === '.') && !buffer_is_escaped)
				{
					// trim right only if last not a literal, and not empty value
					if(!buffer_skip_whitespace)
					{
						if(buffer_last_literal === -1)
						{
							buffer = buffer.trimRight();
						}
						else
						{
							buffer = buffer.slice(0, buffer_last_literal) + buffer.slice(buffer_last_literal, buffer.length).trimRight();
						}
					}
					
					if(context_key === null)
					{
						context_key = [];
					}
					
					context_key.push(buffer);
					++i;
					
					if(chr === '=')
					{
						let value = next('value', null);
						
						// initialize res if null to object
						if(res === null) res = {};
						
						// initialize res section key
						let tmp = res;
						
						// traverse over section in this context, if section is defined
						if(context_section !== null)
						{
							for(let i=0;i<context_section.length;++i)
							{
								tmp = tmp[context_section[i]];
							}
						}
						
						// traverse key
						for(let i=0;i<context_key.length - 1;++i)
						{
							let new_key = context_key[i];
							tmp = tmp[new_key] = tmp[new_key] || {};
						}
						
						tmp[context_key[context_key.length - 1]] = value;
						
						context_key = null;
					}
					else // if(chr === '.')
					{
						buffer = '';
						buffer_skip_whitespace = true;
						buffer_last_literal = -1;
					}
					
					buffer_first = false;
					buffer_begin_of_statement = false;
				}
				else if(chr === '"' && !buffer_is_escaped)
				{
					// only trim spaces between two literals
					if(buffer_last_literal !== -1)
					{
						buffer = buffer.slice(0, buffer_last_literal) + buffer.slice(buffer_last_literal, buffer.length).trimRight();
					}
					
					buffer += next('literal', '');
					
					buffer_first = false;
					buffer_begin_of_statement = false;
					buffer_skip_whitespace = false;
					buffer_last_literal = buffer.length;
				}
				else
				{
					// handle backslash
					if(buffer_is_escaped)
					{
						buffer_is_escaped = false;
					}
					else if(chr === '\\')
					{
						buffer_is_escaped = true;
					}
					
					if(isWhitespace)
					{
						if(!buffer_skip_whitespace)
						{
							buffer_begin_of_statement = false;
							buffer_first = false;
							buffer += chr;
						}
						// else: skip whitespace
					}
					else
					{
						buffer_begin_of_statement = false;
						buffer_skip_whitespace = false;
						buffer_first = false;
						buffer_last_literal = -1;
						buffer += chr;
					}
					++i;
				}
			}
			else if(ctx === 'section')
			{
				if((chr === '.' || chr === ']') && !buffer_is_escaped)
				{
					// trim right only if last not a literal, and not empty value
					if(!buffer_skip_whitespace)
					{
						if(buffer_last_literal === -1)
						{
							buffer = buffer.trimRight();
						}
						else
						{
							buffer = buffer.slice(0, buffer_last_literal) + buffer.slice(buffer_last_literal, buffer.length).trimRight();
						}
					}
					
					if(res === null)
					{
						res = [];
					}
					
					// FEATURE{section.relativeNesting}: if section name starts with a dot, we assume continuing on the previous section, we code this by starting the array with a null value (not an empty string, which could only be set by a literal string)
					if(res.length === 0 && chr === '.' && buffer_skip_whitespace)
					{
						res.push(null);
					}
					else if(buffer.length > 0) // empty section, means to reset section (empty section names are "disallowed", the root section is an empty section)
					{
						res.push(buffer);
					}
					
					++i;
					
					if(chr === ']')
					{
						return res;
					}
					else // if(chr === '.')
					{
						buffer = '';
						buffer_skip_whitespace = true;
						buffer_last_literal = -1;
					}
				}
				else if(buffer_first)
				{
					// skip over '[' start of section
					buffer_first = false;
					++i;
				}
				else if(chr === '"')
				{
					// only trim spaces between two literals
					if(buffer_last_literal !== -1)
					{
						buffer = buffer.slice(0, buffer_last_literal) + buffer.slice(buffer_last_literal, buffer.length).trimRight();
					}
					
					buffer += next('literal', '');
					
					buffer_skip_whitespace = false;
					buffer_last_literal = buffer.length;
				}
				else
				{
					// handle backslash
					if(buffer_is_escaped)
					{
						buffer_is_escaped = false;
					}
					else if(chr === '\\')
					{
						buffer_is_escaped = true;
					}
					
					if(isWhitespace)
					{
						if(!buffer_skip_whitespace)
						{
							buffer += chr;
						}
						// else: skip whitespace
					}
					else
					{
						buffer_skip_whitespace = false;
						buffer_last_literal = -1;
						buffer += chr;
					}
					++i;
				}
			}
			else if(ctx === 'literal')
			{
				if(chr === '"' && !buffer_is_escaped)
				{
					if(buffer_first)
					{
						// begin quote, to start the string literal
						buffer_first = false;
						
						++i; // skip over quote
					}
					else
					{
						++i; // skip over quote
						
						// end quote, ending the string literal
						return JSON.parse('"' + buffer + '"');
					}
				}
				else
				{
					// handle backslash
					if(buffer_is_escaped)
					{
						buffer_is_escaped = false;
					}
					else if(chr === '\\')
					{
						buffer_is_escaped = true;
					}
					
					// interpret chars as intended explicit tab and newlines
					if(chr === '\n')
					{
						buffer += '\\n';
					}
					else if(chr === '\t')
					{
						buffer += '\\t';
					}
					else
					{
						// add next chr to buffer
						buffer += chr;
					}
					++i;
				}
			}
			else if(ctx === 'comment')
			{
				if(isEOL)
				{
					return buffer.trim();
				}
				else if(buffer_first)
				{
					// skip over # or ; that starts a comment
					buffer_first = false;
					++i;
				}
				else
				{
					buffer += chr;
					++i;
				}
			}
			else if(ctx === 'array') // potential multi-line array with ()-parentheses
			{
				if(chr === ')' && !buffer_is_escaped)
				{
					// end of array
					if(res === null) res = [];
					
					return res;
				}
				else if((chr === '#' || chr === ';') && !buffer_is_escaped)
				{
					// start of comment, discard the rest of the line
					let comment = next('comment', null);
					
					// discard the parsed comment
				}
				else if(isEOL || chr === ',' || isWhitespace)
				{
					++i; // skip over newlines and komma's and whitespaces
				}
				else
				{
					// read next value, until comma occurs
					let value = next('value', 'array');
					
					if(res === null) res = [];
					
					res.push(value);
				}
			}
			else if(ctx === 'inlinearraydelimiter')
			{
				if(chr === ',')
				{
					if(res !== ',')
					{
						// one comma is allowed per delimiter, but many whitespaces are allowed
						res = ',';
						++i;
					}
					else
					{
						return res; // a new delimiter starts here, so we must stop now
					}
				}
				else if(isWhitespace)
				{
					++i; // skip over whitespaces
				}
				else
				{
					return res; // end of inline-array delimiter
				}
			}
			else if(ctx === 'value')
			{
				if(isEOL || ((chr === ')' || chr === '}') && !buffer_is_escaped) || buffer_explicit_delim)
				{
					// trim right only if last not a literal, and not empty value
					if(!buffer_skip_whitespace)
					{
						if(buffer_last_literal === -1)
						{
							buffer = buffer.trimRight();
						}
						else
						{
							buffer = buffer.slice(0, buffer_last_literal) + buffer.slice(buffer_last_literal, buffer.length).trimRight();
						}
					}
					
					if(buffer === 'true' || buffer === 'on' || buffer === 'yes')
					{
						buffer = true;
					}
					else if(buffer === 'false' || buffer === 'off' || buffer === 'no' || buffer === 'none')
					{
						buffer = false;
					}
					else if(buffer === 'null')
					{
						buffer = null;
					}
					else if(buffer === 'Infinity')
					{
						buffer = Infinity;
					}
					else if(buffer === 'NaN')
					{
						buffer = NaN;
					}
					else
					{
						if(regex_number.test(buffer))
						{
							let num = parseFloat(buffer);
							
							if(!isNaN(num))
							{
								buffer = num;
							}
						}
					}
					
					// return value immediately, if it is part of a parent array
					if(res === 'array')
					{
						return buffer;
					}
					
					if(Array.isArray(res))
					{
						res.push(buffer);
					}
					else if(buffer_explicit_delim)
					{
						res = [buffer];
					}
					else
					{
						return buffer;
					}
					
					if(!buffer_explicit_delim)
					{
						return res;
					}
					
					buffer_first = false;
					buffer_implicit_delim = false;
					buffer_explicit_delim = false;
					buffer_skip_whitespace = true;
					buffer_last_literal = -1;
					buffer = '';
				}
				else if((chr === '#' || chr === ';') && !buffer_is_escaped)
				{
					// start of comment, discard the rest of the line
					let comment = next('comment', null);
					
					// discard the parsed comment
				}
				else if(isWhitespace && !buffer_skip_whitespace)
				{
					// consume array delimiter with multiple whitespaces
					let delim = next('inlinearraydelimiter', null);
					
					buffer_implicit_delim = delim === null;
					buffer_explicit_delim = !buffer_implicit_delim;
				}
				else if(buffer_implicit_delim)
				{
					// reset implicit delim, it is now made explicit by the occurrence of a new buffer value (order matters, comments are not counted
					buffer_implicit_delim = false;
					
					// convert res to array
					buffer_explicit_delim = true;
				}
				else if(chr === ',' && !buffer_is_escaped)
				{
					// consume array delimiter with multiple whitespaces
					let delim = next('inlinearraydelimiter', null);
					
					buffer_implicit_delim = delim === null; // always false
					buffer_explicit_delim = !buffer_implicit_delim; // always true
				}
				else if(chr === '(' && !buffer_is_escaped)
				{
					// start of multiline array, buffer until now is discarded, and may have been used as a label for the array
					
					++i; // skip over start
					
					return next('array', null);
				}
				else if(chr === '{' && !buffer_is_escaped)
				{
					// start of object, buffer until now is discarded, and may have been used as a label for the object
					
					++i; // skip over start
					
					return next('main', null);
				}
				else if(chr === '"' && !buffer_is_escaped)
				{
					// only trim spaces between two literals
					if(buffer_last_literal !== -1)
					{
						buffer = buffer.slice(0, buffer_last_literal) + buffer.slice(buffer_last_literal, buffer.length).trimRight();
					}
					
					buffer += next('literal', '');
					
					buffer_first = false;
					buffer_skip_whitespace = false;
					buffer_last_literal = buffer.length;
				}
				else
				{
					// handle backslash
					if(buffer_is_escaped)
					{
						buffer_is_escaped = false;
					}
					else if(chr === '\\')
					{
						buffer_is_escaped = true;
					}
					
					if(!(isWhitespace && buffer_skip_whitespace))
					{
						buffer_first = false;
						buffer_skip_whitespace = false;
						buffer_last_literal = -1;
						buffer += chr;
					}
					++i;
				}
			}
			else
			{
				++i;
			}
		}
		
		return res;
	}
	
	return next('main', null);
}
function stringify(obj, depth, inSection)
{
	depth = depth || 0;
	
	if(typeof obj === 'string')
	{
		// check if we can do without double quotes:
		const safestr = JSON.stringify(obj);
		
		if(safestr === '"' + obj + '"' && !/[\s,;#{}()]/.test(obj))
		{
			return obj;
		}
		else
		{
			return safestr;
		}
	}
	else if(typeof obj === 'object')
	{
		if(obj === null)
		{
			return 'null';
		}
		
		let indent_step = '  ';
		let indent = '';
		for(let i=0;i<depth - (inSection ? 1 : 0);++i) indent += indent_step;
		
		const lines = [];
		
		if(Array.isArray(obj))
		{
			let arr = [];
			for(let i=0;i<obj.length;++i)
			{
				arr.push(stringify(obj[i], depth + 1));
			}
			
			var strlen = arr.join(', ').length;
			var nl = '\n';
			
			if(strlen < 80) nl = '';
			
			let line = '(' + nl;
			for(let i=0;i<arr.length;++i)
			{
				if(i > 0)
				{
					line += (nl ? ',' + nl : ', ');
				}
				line += (nl ? indent_step + indent : '') + arr[i];
			}
			line += (nl ? nl + indent : '') + ')';
			lines.push(line);
		}
		else
		{
			if(depth > 0 && !inSection)
			{
				lines.push('{');
			}
			// console.log('printing object: ' + util.inspect(obj));
			for(let key in obj)
			{
				let val = obj[key];
				
				if(typeof val === 'object' && !Array.isArray(val) && !inSection)
				{
					lines.push(indent + '[' + key + ']\n' + stringify(val, depth + 1, true));
					lines.push('');
				}
				else
				{
					lines.push(indent + key + ' = ' + stringify(val, depth + 1));
				}
			}
			
			if(depth > 0 && !inSection)
			{
				lines.push(indent.substring(indent_step.length) + '}');
			}
		}
		
		return lines.join('\n');
	}
	else
	{
		return JSON.stringify(obj);
	}
}

module.exports = {
	parse: parse,
	stringify: stringify,
	normalizeKeys: normalizeKeys
};
