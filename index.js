function parse(data)
{
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
	
	const lines = data.split('\n');
	let i = -1;

	function parse_object()
	{
		++i; // go to next line, before parsing object
		
		const obj = {};
		let ptr = obj;
		let section = null;
		
		// ptr is either obj or obj[section]
		
		for(;i<lines.length;++i)
		{
			let line = lines[i].trim();
			
			for(let j=0;j<line.length;++j)
			{
				const chr = line[j];
	
				// section start
				if(chr === '[')
				{
					++j;
					
					// reset section
					section = null;
					
					// parse section name
					for(let k=j;k<line.length;++k)
					{
						const section_chr = line[k];
						
						// section end
						if(section_chr === ']')
						{
							section = line.substring(j, k).trim();
							
							ptr = obj[section] = {};
							
							break;
						}
					}
					
					break; // EOL
				}
				// comment start
				else if(chr === ';')
				{
					break; // EOL
				}
				// nested object start, as part of array
				else if(chr === '{')
				{
					if(section === null)
					{
						throw new Error('Missing section for array element on line: ' + (i+1));
					}
					
					const value = parse_object();
					
					// ensure this is an array (overwrite)
					if(!Array.isArray(ptr))
					{
						ptr = obj[section] = [];
					}
					
					// add value to array
					obj[section].push(value);
					
					break; // EOL
				}
				// nested object end
				else if(chr === '}')
				{
					return obj; // EOL and end of object
				}
				// key assignment start
				else if(chr === '=')
				{
					let key = line.substring(0, j).trim();
					
					++j;
					
					// parse value
					let values = [];
					let quoted = -1;
					let value_start = j;
					let value_end = -1;
					let value_buffer = '';
					let nextline = false;
					let skipemptylines = false;
					for(let k=j;k<line.length;++k)
					{
						const value_chr = line[k];

						// inside quotes
						if(quoted >= 0)
						{
							// quote end
							if(value_chr === '"')
							{
								// add value to buffer
								value_buffer += JSON.parse('"' + line.substring(quoted, k) + '"');
								value_start = k + 1;
								
								// reset quoted
								quoted = -1;

								// check if end of line
								if(k + 1 === line.length)
								{
									value_end = k + 1;
								}
							}
							// skip over escape char
							else if(value_chr === '\\')
							{
								++k;
							}
						}
						// comment start
						else if(value_chr === ';')
						{
							value_end = k;
							
							k = line.length; // break after storing this value
						}
						// quote start
						else if(value_chr === '"')
						{
							quoted = k + 1;
							
							value_buffer += line.substring(value_start, k).trim();
						}
						// nested object start
						else if(value_chr === '{')
						{
							values.push(parse_object());
							
							// keep parsing on last line
							line = lines[i].trim();
							
							if(line.endsWith(','))
							{
								nextline = true;
							}
							else
							{
								k = line.indexOf('}');
								j = k + 1;
								value_start = k + 1;
								value_end = -1;
								value_buffer = '';
								skipemptylines = false;
								
								continue;
							}
						}
						else if(value_chr === '\\' && k + 1 === line.length)
						{
							nextline = true;
						}
						else if(value_chr === ',')
						{
							if(k + 1 === line.length)
							{
								nextline = true;
							}
							
							// unless the last value was an object, in which case, any labelstring between } and , is discarded
							if(values.length === 0 || typeof values[values.length - 1] !== 'object')
							{
								value_end = k;
								
								// skip over char
								++k;
							}
						}
						else if(k + 1 === line.length)
						{
							value_end = k + 1;
						}
						
						// if string value has been read, parse it, and add to array of values
						if(value_end !== -1)
						{
							let value = value_buffer + line.substring(value_start, value_end).trim();
							
							let special = value.toLowerCase();
	
							if(special === 'true' || special === 'on' || special === 'yes')
							{
								value = true;
							}
							else if(special === 'false' || special === 'off' || special === 'no' || special === 'none')
							{
								value = false;
							}
							else if(special === 'null')
							{
								value = null;
							}
							else // try parse as a number
							{
								let number = parseFloat(value);
								if(!isNaN(number))
								{
									value = number;
								}
								// else: it must be a string
							}
							
							// skip empty lines after a , occurs
							if(skipemptylines && value.length === 0)
							{
								nextline = true;
							}
							else
							{
								values.push(value);
								
								// reset
								skipemptylines = false;
								value_buffer = '';
								value_start = k;
								value_end = -1;
							}
						}
						if(nextline)
						{
							// continue on the next line
							if(i + 1 === lines.length) throw new Error('Trailing comma at end of file at line: ' + (i+1));
							
							nextline = false;
							j = 0;
							k = -1;
							value_buffer = '';
							value_start = 0;
							value_end = -1;
							line = lines[++i].trim();
							skipemptylines = true; // when nextline is used, we allow empty lines in between (or comments)
						}
					}
					
					if(values.length === 1)
					{
						// interpret 'true', 'on' as boolean
						// if these are supposed to be used as literal strings, they must be quoted
						
						ptr[key] = values[0];
					}
					else
					{
						ptr[key] = values;
					}
					
					break; // EOL
				}
			}
		}
		
		return obj;
	}
	
	return parse_object();
}
function stringify(obj, depth)
{
	depth = depth || 0;
	
	if(typeof obj === 'string')
	{
		// check if we can do without double quotes:
		const safestr = JSON.stringify(obj);
		
		if(obj.indexOf(',') === -1 && obj.indexOf('{') === -1 && obj.indexOf(';') === -1 && safestr === '"' + obj + '"')
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
		
		var indent_step = '  ';
		var indent = '';
		for(let i=0;i<depth;++i) indent += indent_step;
		
		const lines = [];
		
		if(Array.isArray(obj))
		{
			let line = '';
			for(let i=0;i<obj.length;++i)
			{
				if(i > 0) line += ', ';
				if(typeof obj[i] === 'object' && obj[i] !== null)
				{
					line += '\n' + indent;
				}
				line += stringify(obj[i], depth + 1);
			}
			lines.push(line);
		}
		else
		{
			if(depth > 0)
			{
				lines.push('{');
			}
			
			for(let key in obj)
			{
				var val = obj[key];
				if(Array.isArray(val) && val.filter(v => typeof v === 'object' && v !== null).length > 0)
				{
					lines.push(indent + '[' + key + ']' + stringify(val, depth));
				}
				else
				{
					lines.push(indent + key + ' = ' + stringify(val, depth + 1));
				}
			}
			
			if(depth > 0)
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
	stringify: stringify
};
