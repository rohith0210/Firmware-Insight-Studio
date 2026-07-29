#include <stdint.h>
void large_function_A(void){ volatile int d[1000]; for(int i=0;i<1000;i++) d[i]=i; }
void large_function_B(void){ volatile int d[2000]; for(int i=0;i<2000;i++) d[i]=i; }
int main(void){ large_function_A(); large_function_B(); return 0; }
