#include <stdio.h>

void large_function_A() {
    int data[1000];
    for(int i=0; i<1000; i++) data[i] = i;
}

void large_function_B() {
    int data[2000];
    for(int i=0; i<2000; i++) data[i] = i;
}

int main() {
    large_function_A();
    large_function_B();
    return 0;
}
