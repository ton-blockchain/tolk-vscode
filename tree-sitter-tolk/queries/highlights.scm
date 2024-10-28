"do" @keyword
"if" @keyword
"fun" @keyword
"asm" @keyword
"get" @keyword
"try" @keyword
"var" @keyword
"val" @keyword
"else" @keyword
"true" @keyword
"tolk" @keyword
"const" @keyword
"false" @keyword
"throw" @keyword
"redef" @keyword
"while" @keyword
"catch" @keyword
"ifnot" @keyword
"return" @keyword
"assert" @keyword
"import" @keyword
"global" @keyword
"repeat" @keyword
"mutate" @keyword
(null_literal) @keyword
(builtin_specifier) @keyword

"=" @operator
"+=" @operator
"-=" @operator
"*=" @operator
"/=" @operator
"%=" @operator
"<<=" @operator
">>=" @operator
"&=" @operator
"|=" @operator
"^=" @operator

"==" @operator
"<" @operator
">" @operator
"<=" @operator
">=" @operator
"!=" @operator
"<=>" @operator
"<<" @operator
">>" @operator
"~>>" @operator
"^>>" @operator
"-" @operator
"+" @operator
"|" @operator
"^" @operator
"*" @operator
"/" @operator
"%" @operator
"~/" @operator
"^/" @operator
"&" @operator
"~" @operator
"." @operator
"!" @operator
"&&" @operator
"||" @operator

"->" @operator


(string_literal) @string
(number_literal) @number
(boolean_literal) @number

(annotation) @attribute

(function_declaration
  name: (function_name) @function)
(get_method_declaration
  name: (function_name) @function)
(function_call
  called_f: (identifier) @function)
(dot_method_call
  method_name: (identifier) @function)

(genericT_item) @type
(primitive_type) @type
(auto_type) @type
(void_type) @type
(self_type) @type

(identifier) @variable

(comment) @comment
